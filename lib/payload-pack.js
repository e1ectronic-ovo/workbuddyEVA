'use strict';

// 应用负载包（增量更新）：gzip(JSON 头部一行 + 各文件内容顺序拼接)。
// 头部记录版本与每个文件的路径 / 大小 / SHA256，应用时逐文件校验后覆盖到 payload 目录。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

const FORMAT = 'wbwe-pack-1';
const MARKER = '.bundle.json';
const CORE_NAME = 'workbuddyEVA-update.pack';
const ASSETS_NAME = 'workbuddyEVA-assets.pack';

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeRelative(value) {
  const rel = String(value || '').replace(/\\/g, '/');
  if (!rel || rel.startsWith('/') || /^[a-z]:/i.test(rel)) return '';
  const parts = rel.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return '';
  return rel;
}

function parsePack(file) {
  let raw;
  try {
    raw = zlib.gunzipSync(fs.readFileSync(file));
  } catch (_) {
    throw new Error('更新包已损坏，请重新下载');
  }
  const newline = raw.indexOf(0x0a);
  if (newline < 0) throw new Error('更新包格式无效，请重新下载');
  let header;
  try {
    header = JSON.parse(raw.slice(0, newline).toString('utf8'));
  } catch (_) {
    throw new Error('更新包格式无效，请重新下载');
  }
  if (!header || header.format !== FORMAT || !Array.isArray(header.files)) {
    throw new Error('更新包版本不兼容，请下载完整安装包');
  }
  let offset = newline + 1;
  const files = header.files.map((item) => {
    const rel = safeRelative(item && item.path);
    if (!rel) throw new Error('更新包包含非法路径');
    const size = Number(item.size);
    if (!Number.isInteger(size) || size < 0) throw new Error('更新包文件大小无效');
    const entry = { path: rel, size, sha256: String(item.sha256 || '').toLowerCase(), offset };
    offset += size;
    return entry;
  });
  if (offset !== raw.length) throw new Error('更新包长度不一致，请重新下载');
  return { header, files, buffer: raw };
}

function extract(pack, destination) {
  const root = path.resolve(destination);
  let count = 0;
  for (const entry of pack.files) {
    const target = path.resolve(root, entry.path);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('更新包路径越界');
    const data = pack.buffer.slice(entry.offset, entry.offset + entry.size);
    if (entry.sha256 && sha256(data) !== entry.sha256) {
      throw new Error('更新包文件校验失败：' + entry.path);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    count += 1;
  }
  return count;
}

function readMarker(payloadDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(payloadDir, MARKER), 'utf8'));
  } catch (_) {
    return null;
  }
}

function installed(payloadDir) {
  return Boolean(payloadDir) && fs.existsSync(path.join(payloadDir, 'app', 'daemon.js'));
}

// 把核心包与（按需）资源包覆盖到 payload：先复制现有负载到暂存目录，
// 再逐文件写入并校验，成功后整体换名；失败保留原目录。
function applyPacks(payloadDir, packFiles) {
  if (!installed(payloadDir)) {
    throw new Error('当前是免安装单文件运行，请下载完整安装包更新');
  }
  const parent = path.dirname(path.resolve(payloadDir));
  const staging = path.join(parent, '.payload-' + Date.now());
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(payloadDir, staging, { recursive: true });

  let core = null;
  let count = 0;
  try {
    for (const file of packFiles) {
      if (!file) continue;
      const pack = parsePack(file);
      if (!core && pack.header.kind !== 'assets') core = pack.header;
      count += extract(pack, staging);
    }
    if (!core) throw new Error('缺少更新核心包');
    const marker = {
      version: String(core.version || ''),
      assetsSha256: String(core.assetsSha256 || ''),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(staging, MARKER), JSON.stringify(marker, null, 2) + '\n');

    const backup = payloadDir + '.bak';
    fs.rmSync(backup, { recursive: true, force: true });
    fs.renameSync(payloadDir, backup);
    try {
      fs.renameSync(staging, payloadDir);
    } catch (error) {
      fs.renameSync(backup, payloadDir);
      throw error;
    }
    return { version: marker.version, files: count };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

module.exports = {
  FORMAT,
  MARKER,
  CORE_NAME,
  ASSETS_NAME,
  sha256,
  safeRelative,
  parsePack,
  extract,
  readMarker,
  installed,
  applyPacks,
};