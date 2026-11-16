'use strict';

// 共用打包逻辑：找 pkg 基础镜像 → 写入桌面图标 / 版本信息 / GUI 子系统 → 交给 pkg 追加快照。
// 先把资源写进基础镜像，再让 pkg 打包，避免 pkg 追加在文件尾部的快照被 PE 重写弄丢。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const RE = require('resedit');

const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'assets', 'app.ico');
const META = require(path.join(ROOT, 'package.json'));

function cacheRoots() {
  const roots = [];
  if (process.env.PKG_CACHE_PATH) roots.push(process.env.PKG_CACHE_PATH);
  roots.push(path.join(os.homedir(), '.pkg-cache'));
  return [...new Set(roots)];
}

function findBase(target) {
  const match = /^node(\d+)-win-x64$/.exec(target);
  if (!match) throw new Error('只支持 node<大版本>-win-x64 目标，收到: ' + target);
  const major = Number(match[1]);
  const pattern = new RegExp('^fetched-v' + major + '\\.\\d+\\.\\d+-win-x64$');
  const hits = [];
  for (const root of cacheRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      const folder = path.join(root, dir.name);
      for (const file of fs.readdirSync(folder)) {
        if (!pattern.test(file)) continue;
        const version = file.slice('fetched-v'.length, -'-win-x64'.length);
        hits.push({ file: path.join(folder, file), version });
      }
    }
  }
  if (!hits.length) return null;
  hits.sort((a, b) => {
    const pa = a.version.split('.').map(Number);
    const pb = b.version.split('.').map(Number);
    for (let i = 0; i < 3; i += 1) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  });
  return hits[0];
}

function resolveBase(target) {
  const base = findBase(target);
  if (base) return { target, base };
  const fallback = findBase('node20-win-x64');
  if (!fallback) {
    throw new Error('没有找到 ' + target + ' 的 pkg 基础镜像；先联网执行一次打包让 pkg 下载基础镜像');
  }
  console.log('[brand] 本机没有 ' + target + ' 基础镜像，改用缓存的 node20 镜像打包');
  return { target: 'node20-win-x64', base: fallback };
}

function stampBase(source, destination, options = {}) {
  const exe = RE.NtExecutable.from(fs.readFileSync(source), { ignoreCert: true });
  // GUI 子系统：双击不弹黑色 cmd 窗口
  exe.newHeader.optionalHeader.subsystem = 2;

  const iconFile = RE.Data.IconFile.from(fs.readFileSync(ICON));
  const resources = RE.NtExecutableResource.from(exe);
  const groups = RE.Resource.IconGroupEntry.fromEntries(resources.entries);
  const ids = groups.length ? groups.map(group => group.id) : [1];
  for (const id of ids) {
    RE.Resource.IconGroupEntry.replaceIconsForResource(
      resources.entries, id, 1033, iconFile.icons.map(item => item.data)
    );
  }

  const [major, minor, patch] = String(META.version || '1.0.0').split('.').map(Number);
  const versions = RE.Resource.VersionInfo.fromEntries(resources.entries);
  if (versions.length) {
    const info = versions[0];
    info.setFileVersion(major || 1, minor || 0, patch || 0, 0, 1033);
    info.setProductVersion(major || 1, minor || 0, patch || 0, 0, 1033);
    info.setStringValues({ lang: 1033, codepage: 1200 }, {
      FileDescription: options.description || 'workbuddyEVA',
      ProductName: META.productName || 'workbuddyEVA',
      InternalName: options.internalName || 'workbuddyEVA',
      OriginalFilename: options.originalFilename || path.basename(destination),
    });
    info.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  fs.writeFileSync(destination, Buffer.from(exe.generate()));
}

function buildPackage({ input, output, description, internalName, originalFilename, target }) {
  const wanted = target || process.env.PKG_TARGET || 'node22-win-x64';
  const { target: actual, base } = resolveBase(wanted);
  const workDir = path.join(ROOT, '.build');
  const stamped = path.join(workDir, 'base-' + path.basename(output, '.exe') + '.exe');
  fs.mkdirSync(workDir, { recursive: true });
  stampBase(base.file, stamped, { description, internalName, originalFilename });
  console.log('[brand] 已将桌面图标写入基础镜像: ' + base.version);

  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = ['--yes', '@yao-pkg/pkg', input, '--compress', 'GZip', '--targets', actual, '--output', output];
  const result = spawnSync('npx', args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: Object.assign({}, process.env, { PKG_NODE_PATH: stamped }),
  });
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('[brand] 输出: ' + output);
}

module.exports = { buildPackage, resolveBase, stampBase };
