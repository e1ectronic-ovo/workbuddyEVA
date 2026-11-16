'use strict';

// 自定义壁纸：用户上传的本地图片 / 视频，存 data/custom/ 下，索引写在 index.json。
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(require('./paths').DATA_DIR, 'custom');
const INDEX = path.join(DATA_DIR, 'index.json');
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv', '.m4v'];
const MAX_BYTES = 600 * 1024 * 1024;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function typeOf(ext) {
  const e = String(ext || '').toLowerCase();
  if (IMAGE_EXT.includes(e)) return 'image';
  if (VIDEO_EXT.includes(e)) return 'video';
  return '';
}

function list() {
  try {
    const raw = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(x => x && x.id && x.file && fs.existsSync(path.join(DATA_DIR, x.file)));
  } catch (_) {
    return [];
  }
}

function save(items) {
  ensureDir();
  const tmp = INDEX + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf8');
  fs.renameSync(tmp, INDEX);
}

function add(entry) {
  const items = list();
  items.unshift(entry);
  save(items);
  return entry;
}

function remove(id) {
  const items = list();
  const hit = items.find(x => x.id === id) || null;
  save(items.filter(x => x.id !== id));
  if (hit) {
    try { fs.unlinkSync(path.join(DATA_DIR, hit.file)); } catch (_) {}
  }
  return hit;
}

module.exports = { DATA_DIR, INDEX, IMAGE_EXT, VIDEO_EXT, MAX_BYTES, typeOf, list, add, remove };
