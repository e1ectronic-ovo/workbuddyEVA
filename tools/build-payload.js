'use strict';

// 生成应用负载目录与增量更新包：
//   dist/payload/                      完整负载（安装器使用）
//   dist/workbuddyEVA-update.pack      核心包：代码 / 页面 / 依赖
//   dist/workbuddyEVA-assets.pack      资源包：图片 / 图标 / WebGL 引擎等大文件
// 资源包不变时只下载核心包，日常更新通常不到 1 MB。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { sha256, FORMAT, MARKER, CORE_NAME, ASSETS_NAME } = require('../lib/payload-pack');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'payload');
const META = require(path.join(ROOT, 'package.json'));

const SOURCES = [
  'server.js', 'app', 'lib', 'helpers', 'public', 'scene-live', 'assets',
  path.join('node_modules', 'ws'), path.join('node_modules', 'webwallgl'),
];

function walk(relative) {
  const abs = path.join(ROOT, relative);
  const stat = fs.statSync(abs);
  if (stat.isFile()) return [relative];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function isAsset(rel) {
  const posix = rel.split(path.sep).join('/');
  if (posix.startsWith('assets/')) return true;
  if (posix.startsWith('public/assets/')) return true;
  if (posix.startsWith('node_modules/webwallgl/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|ico|woff2?|ttf|otf|bin|mp4|webm|wav|mp3)$/i.test(posix);
}

function writePack(file, header, entries) {
  const headerLine = Buffer.from(JSON.stringify(header) + '\n', 'utf8');
  const body = Buffer.concat([headerLine].concat(entries.map((entry) => entry.data)));
  const packed = zlib.gzipSync(body, { level: 9 });
  fs.writeFileSync(file, packed);
  return { size: packed.length, sha256: sha256(packed) };
}

function main() {
  const files = SOURCES.reduce((list, dir) => list.concat(walk(dir)), []).concat(['package.json']);
  const unique = [...new Set(files)].sort();
  const entries = unique.map((rel) => {
    const data = fs.readFileSync(path.join(ROOT, rel));
    return { rel, posix: rel.split(path.sep).join('/'), data, sha256: sha256(data) };
  });
  const core = entries.filter((entry) => !isAsset(entry.rel));
  const assets = entries.filter((entry) => isAsset(entry.rel));

  fs.mkdirSync(DIST, { recursive: true });
  const assetsFile = path.join(DIST, ASSETS_NAME);
  const assetsPack = writePack(assetsFile, {
    format: FORMAT,
    kind: 'assets',
    version: META.version,
    files: assets.map((entry) => ({ path: entry.posix, size: entry.data.length, sha256: entry.sha256 })),
  }, assets);

  const coreFile = path.join(DIST, CORE_NAME);
  const corePack = writePack(coreFile, {
    format: FORMAT,
    kind: 'core',
    version: META.version,
    assetsSha256: assetsPack.sha256,
    assetsSize: assetsPack.size,
    files: core.map((entry) => ({ path: entry.posix, size: entry.data.length, sha256: entry.sha256 })),
  }, core);

  fs.rmSync(STAGE, { recursive: true, force: true });
  for (const entry of entries) {
    const target = path.join(STAGE, entry.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, entry.data);
  }
  const marker = {
    version: META.version,
    assetsSha256: assetsPack.sha256,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(STAGE, MARKER), JSON.stringify(marker, null, 2) + '\n');

  const manifest = {
    version: META.version,
    files: entries.length,
    unpacked: entries.reduce((sum, entry) => sum + entry.data.length, 0),
    core: { name: CORE_NAME, size: corePack.size, sha256: corePack.sha256, files: core.length },
    assets: { name: ASSETS_NAME, size: assetsPack.size, sha256: assetsPack.sha256, files: assets.length },
  };
  fs.writeFileSync(path.join(DIST, 'payload-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log('[payload] 版本 ' + META.version + '，共 ' + entries.length + ' 个文件');
  console.log('[payload] 核心包: ' + (corePack.size / 1024).toFixed(0) + ' KB（' + core.length + ' 个文件）');
  console.log('[payload] 资源包: ' + (assetsPack.size / 1048576).toFixed(2) + ' MB（' + assets.length + ' 个文件）');
}

main();