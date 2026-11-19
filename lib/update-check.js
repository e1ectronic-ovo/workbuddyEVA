'use strict';

// GitHub 版本检测与更新包下载。只读取本仓库的 latest release，
// 安装版优先使用增量负载包（核心包 + 按需资源包），便携版仍下载完整安装包。
// 文件保存在自有数据目录，是否下载、是否安装都由用户决定。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DATA_DIR, APP_DIR } = require('./paths');
const payloadPack = require('./payload-pack');

const REPO = 'e1ectronic-ovo/workbuddyEVA';
const RELEASES_API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
const UPDATE_DIR = path.join(DATA_DIR, 'updates');
const CHECK_TTL = 10 * 60 * 1000;
const ERROR_TTL = 30 * 1000;

let cachedCheck = { at: 0, value: null, error: '' };
let cachedVersion = '';
let downloading = null;
const downloadState = { state: 'idle' };

function currentVersion() {
  if (cachedVersion) return cachedVersion;
  try { cachedVersion = String(require('../package.json').version || '0.0.0'); } catch (_) { cachedVersion = '0.0.0'; }
  return cachedVersion;
}

function parseVersion(value) {
  return String(value || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 4)
    .map((part) => parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] || 0) - (right[i] || 0);
    if (diff) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function downloadDir() {
  fs.mkdirSync(UPDATE_DIR, { recursive: true });
  return UPDATE_DIR;
}

function payloadDir() {
  return path.join(APP_DIR, 'payload');
}

function canUsePayload() {
  return Boolean(process.pkg) && payloadPack.installed(payloadDir());
}

async function fetchRelease() {
  let res;
  try {
    res = await fetch(RELEASES_API, {
      headers: {
        'User-Agent': 'workbuddyEVA/' + currentVersion(),
        Accept: 'application/vnd.github+json',
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new Error('连接 GitHub 超时，请稍后重试或检查网络');
    }
    throw new Error('无法连接 GitHub：' + (error && error.message || error));
  }
  if (res.status === 404) throw new Error('GitHub 上还没有发布版本');
  if (res.status === 403 || res.status === 429) throw new Error('GitHub 接口访问受限，请稍后再试');
  if (!res.ok) throw new Error('GitHub 返回 HTTP ' + res.status);
  return res.json();
}

function assetInfo(asset, kind) {
  if (!asset) return null;
  const digest = /^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest || ''));
  return {
    kind,
    name: path.basename(String(asset.name || '')),
    size: Number(asset.size) || 0,
    url: String(asset.browser_download_url || ''),
    sha256: digest ? digest[1].toLowerCase() : '',
  };
}

function pickAssets(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const find = (pattern) => list.find((item) => pattern.test(String(item && item.name || '')));
  return {
    core: assetInfo(find(/-update\.pack$/i), 'payload'),
    assets: assetInfo(find(/-assets\.pack$/i), 'assets'),
    installer: assetInfo(find(/Setup\.exe$/i) || find(/\.exe$/i), 'installer'),
  };
}

async function check(force) {
  const now = Date.now();
  if (!force && cachedCheck.value && now - cachedCheck.at < CHECK_TTL) {
    return Object.assign({}, cachedCheck.value, { cached: true });
  }
  if (!force && cachedCheck.error && now - cachedCheck.at < ERROR_TTL) {
    throw new Error(cachedCheck.error);
  }
  try {
    const data = await fetchRelease();
    const latest = String(data.tag_name || data.name || '').replace(/^v/i, '');
    const current = currentVersion();
    const packs = pickAssets(data.assets);
    const download = (canUsePayload() && packs.core) || packs.installer;
    const value = {
      current,
      latest,
      hasUpdate: Boolean(latest) && compareVersions(latest, current) > 0,
      name: String(data.name || latest || ''),
      notes: String(data.body || '').slice(0, 12000),
      publishedAt: String(data.published_at || ''),
      htmlUrl: String(data.html_url || ('https://github.com/' + REPO + '/releases/latest')),
      download,
      assetsDownload: packs.assets,
      incremental: Boolean(download && download.kind === 'payload'),
      cached: false,
    };
    cachedCheck = { at: now, value, error: '' };
    return value;
  } catch (error) {
    cachedCheck = { at: now, value: null, error: error.message };
    throw error;
  }
}

function publicState() {
  return {
    state: downloadState.state || 'idle',
    kind: downloadState.kind || '',
    phase: downloadState.phase || '',
    name: downloadState.name || '',
    version: downloadState.version || '',
    received: downloadState.received || 0,
    total: downloadState.total || 0,
    path: downloadState.path || '',
    error: downloadState.error || '',
  };
}

function targetOf(asset) {
  return path.join(downloadDir(), String(asset.name).replace(/[^\w.\- ]+/g, '_'));
}

async function fetchTo(asset, target, part) {
  let handle;
  try {
    const res = await fetch(asset.url, {
      headers: { 'User-Agent': 'workbuddyEVA/' + currentVersion() },
      redirect: 'follow',
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    if (!res.ok) throw new Error('下载失败：HTTP ' + res.status);
    const declared = Number(res.headers.get('content-length')) || asset.size || 0;
    if (declared) downloadState.total = declared;
    const hash = crypto.createHash('sha256');
    handle = await fs.promises.open(part, 'w');
    let received = 0;
    for await (const chunk of res.body) {
      await handle.write(chunk);
      hash.update(chunk);
      received += chunk.length;
      downloadState.received = received;
    }
    await handle.close();
    handle = null;
    if (asset.size && received !== asset.size) {
      throw new Error('安装包大小不一致（' + received + ' / ' + asset.size + '）');
    }
    const digest = hash.digest('hex');
    if (asset.sha256 && digest !== asset.sha256) throw new Error('安装包校验失败，请重新下载');
    fs.renameSync(part, target);
    return digest;
  } catch (error) {
    try { if (handle) await handle.close(); } catch (_) {}
    try { if (fs.existsSync(part)) fs.unlinkSync(part); } catch (_) {}
    throw error;
  }
}

async function downloadPayload(info) {
  const core = info.download;
  const coreFile = targetOf(core);
  Object.assign(downloadState, {
    state: 'downloading', kind: 'payload', phase: 'core', name: core.name,
    version: info.latest, received: 0, total: core.size || 0, path: '', error: '',
  });
  await fetchTo(core, coreFile, coreFile + '.part');

  const header = payloadPack.parsePack(coreFile).header;
  let assetsFile = '';
  const assets = info.assetsDownload;
  const marker = payloadPack.readMarker(payloadDir());
  if (assets && String(header.assetsSha256 || '') !== String(marker && marker.assetsSha256 || '')) {
    Object.assign(downloadState, {
      phase: 'assets', name: assets.name, received: 0, total: assets.size || 0,
    });
    assetsFile = targetOf(assets);
    const digest = await fetchTo(assets, assetsFile, assetsFile + '.part');
    if (header.assetsSha256 && digest !== header.assetsSha256) {
      throw new Error('资源包与核心包不匹配，请重新下载');
    }
  }

  downloadState.state = 'done';
  downloadState.phase = 'done';
  downloadState.version = String(header.version || info.latest);
  downloadState.path = coreFile;
  downloadState.assetsPath = assetsFile;
  downloadState.received = downloadState.total;
  downloadState.error = '';
}

async function startDownload() {
  if (downloadState.state === 'downloading' && downloading) return publicState();
  let info;
  try { info = await check(false); } catch (error) {
    downloadState.state = 'error';
    downloadState.error = error.message;
    throw error;
  }
  if (!info.download) throw new Error('最新版本没有可下载的更新包');
  if (!info.hasUpdate) {
    throw new Error(info.latest === info.current ? '当前已是最新版本' : '最新版本低于当前版本');
  }
  if (downloadState.state === 'done' && downloadState.version === info.latest
    && downloadState.path && fs.existsSync(downloadState.path)) {
    return publicState();
  }
  downloading = (info.download.kind === 'payload' ? downloadPayload(info) : (async () => {
    const target = targetOf(info.download);
    Object.assign(downloadState, {
      state: 'downloading', kind: 'installer', phase: 'installer', name: info.download.name,
      version: info.latest, received: 0, total: info.download.size || 0, path: '', error: '',
    });
    await fetchTo(info.download, target, target + '.part');
    downloadState.state = 'done';
    downloadState.phase = 'done';
    downloadState.path = target;
    downloadState.version = info.latest;
    downloadState.received = downloadState.total;
  })()).catch((error) => {
    downloadState.state = 'error';
    downloadState.error = error.message;
  }).finally(() => { downloading = null; });
  return publicState();
}

function underUpdates(file) {
  const root = path.resolve(downloadDir()) + path.sep;
  return path.resolve(file).startsWith(root);
}

function scheduleRestart() {
  if (!process.pkg) return false;
  const exe = process.execPath;
  const dir = path.dirname(exe);
  const quote = (text) => "'" + String(text).replace(/'/g, "''") + "'";
  const script = 'for($i=0;$i -lt 300;$i++){'
    + ' if(-not (Get-Process -Id ' + process.pid + ' -ErrorAction SilentlyContinue)){break};'
    + ' Start-Sleep -Milliseconds 400 };'
    + ' Start-Sleep -Milliseconds 600;'
    + ' Start-Process -FilePath ' + quote(exe) + ' -WorkingDirectory ' + quote(dir);
  try {
    const child = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

function install() {
  if (downloadState.state !== 'done') throw new Error('更新包还没有下载完成');
  const file = path.resolve(downloadState.path || '');
  if (!underUpdates(file) || !fs.existsSync(file)) {
    throw new Error('更新包路径无效，请重新下载');
  }

  if (downloadState.kind === 'payload') {
    if (!canUsePayload()) throw new Error('当前是免安装单次运行，请下载完整安装包更新');
    const packs = [file];
    if (downloadState.assetsPath) {
      const assets = path.resolve(downloadState.assetsPath);
      if (!underUpdates(assets) || !/\.pack$/i.test(assets) || !fs.existsSync(assets)) {
        throw new Error('资源包路径无效，请重新下载');
      }
      packs.push(assets);
    }
    if (!/\.pack$/i.test(file)) throw new Error('更新包路径无效，请重新下载');
    const result = payloadPack.applyPacks(payloadDir(), packs);
    const restart = scheduleRestart();
    return { kind: 'payload', version: result.version, files: result.files, restart };
  }

  if (!/\.exe$/i.test(file)) throw new Error('安装包路径无效，请重新下载');
  const child = spawn(file, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(file),
    windowsHide: false,
  });
  child.unref();
  return { kind: 'installer', name: downloadState.name, path: file, restart: false };
}

module.exports = { check, startDownload, downloadState: publicState, install, compareVersions, currentVersion };