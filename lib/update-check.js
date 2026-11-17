'use strict';

// GitHub 版本检测与更新包下载。只读取本仓库的 latest release，
// 安装包保存在自有数据目录，是否下载、是否安装都由用户决定。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DATA_DIR } = require('./paths');

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

function pickAsset(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const asset = list.find((item) => /Setup\.exe$/i.test(item && item.name || ''))
    || list.find((item) => /\.exe$/i.test(item && item.name || ''));
  if (!asset) return null;
  const digest = /^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest || ''));
  return {
    name: path.basename(String(asset.name || 'workbuddyEVA-Setup.exe')),
    size: Number(asset.size) || 0,
    url: String(asset.browser_download_url || ''),
    sha256: digest ? digest[1].toLowerCase() : '',
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
    const value = {
      current,
      latest,
      hasUpdate: Boolean(latest) && compareVersions(latest, current) > 0,
      name: String(data.name || latest || ''),
      notes: String(data.body || '').slice(0, 12000),
      publishedAt: String(data.published_at || ''),
      htmlUrl: String(data.html_url || ('https://github.com/' + REPO + '/releases/latest')),
      download: pickAsset(data.assets),
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
    name: downloadState.name || '',
    received: downloadState.received || 0,
    total: downloadState.total || 0,
    path: downloadState.path || '',
    error: downloadState.error || '',
  };
}

async function runDownload(asset, target, part) {
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
    downloadState.state = 'done';
    downloadState.received = received;
    downloadState.total = received;
    downloadState.path = target;
    downloadState.error = '';
  } catch (error) {
    try { if (handle) await handle.close(); } catch (_) {}
    try { if (fs.existsSync(part)) fs.unlinkSync(part); } catch (_) {}
    downloadState.state = 'error';
    downloadState.error = error.message;
  } finally {
    downloading = null;
  }
}

async function startDownload() {
  if (downloadState.state === 'downloading' && downloading) return publicState();
  let info;
  try { info = await check(false); } catch (error) {
    downloadState.state = 'error';
    downloadState.error = error.message;
    throw error;
  }
  if (!info.download) throw new Error('最新版本没有可下载的安装包');
  const target = path.join(downloadDir(), info.download.name.replace(/[^\w.\- ]+/g, '_'));
  if (downloadState.state === 'done' && downloadState.path === target && fs.existsSync(target)) {
    return publicState();
  }
  if (!info.hasUpdate) {
    throw new Error(info.latest === info.current ? '当前已是最新版本' : '最新版本低于当前版本');
  }
  const part = target + '.part';
  Object.assign(downloadState, {
    state: 'downloading',
    name: info.download.name,
    path: '',
    received: 0,
    total: info.download.size || 0,
    error: '',
  });
  downloading = runDownload(info.download, target, part);
  return publicState();
}

function install() {
  if (downloadState.state !== 'done') throw new Error('安装包还没有下载完成');
  const file = path.resolve(downloadState.path || '');
  const root = path.resolve(downloadDir()) + path.sep;
  if (!file.startsWith(root) || !/\.exe$/i.test(file) || !fs.existsSync(file)) {
    throw new Error('安装包路径无效，请重新下载');
  }
  const child = spawn(file, [], {
    detached: true,
    stdio: 'ignore',
    cwd: path.dirname(file),
    windowsHide: false,
  });
  child.unref();
  return { name: downloadState.name, path: file };
}

module.exports = { check, startDownload, downloadState: publicState, install, compareVersions, currentVersion };
