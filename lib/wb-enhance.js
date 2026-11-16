'use strict';

// 增强选项：免打扰、自动继续。保存在自有数据目录，随注入状态下发。
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const FILE = path.join(DATA_DIR, 'wb', 'enhance.json');
const DEFAULTS = { dnd: false, autoContinue: false };

function normalize(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    dnd: !!value.dnd,
    autoContinue: !!value.autoContinue,
  };
}

function load() {
  try {
    return normalize(JSON.parse(fs.readFileSync(FILE, 'utf8')));
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function save(patch) {
  const next = normalize({ ...load(), ...(patch || {}) });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const temp = FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
  fs.renameSync(temp, FILE);
  return next;
}

function publicState() {
  return load();
}

module.exports = { load, save, publicState, FILE };
