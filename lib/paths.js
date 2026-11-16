'use strict';

const fs = require('fs');
const path = require('path');

const BUNDLE_DIR = path.join(__dirname, '..');
const APP_DIR = process.pkg ? path.dirname(process.execPath) : BUNDLE_DIR;

const APP_ID = 'workbuddy-eva';
const APP_NAME = 'workbuddyEVA';
const APP_NAME_EN = 'workbuddyEVA';
const LEGACY_APP_IDS = ['workbuddy-wallpaper', 'workbuddy-wallpaper-engine'];
const EXE_NAME = 'workbuddyEVA.exe';
const DATA_PATH_FILE = 'data-path.txt';

// 数据目录优先级：WBWE_DATA_DIR 环境变量 → exe 旁边的 data-path.txt → 默认目录。
// 安装版由安装器写入 data-path.txt（可选任意磁盘）；便携版默认放 exe 同级 data，
// 不再默认写进 %APPDATA%（C 盘）。
function configuredDataDir() {
  const candidates = [path.join(APP_DIR, DATA_PATH_FILE), path.join(BUNDLE_DIR, DATA_PATH_FILE)];
  for (const file of candidates) {
    try {
      const value = fs.readFileSync(file, 'utf8').trim();
      if (value) return path.resolve(path.dirname(file), value);
    } catch (_) {}
  }
  return '';
}

const DEFAULT_DATA_DIR = process.pkg
  ? path.join(APP_DIR, 'data')
  : path.join(BUNDLE_DIR, 'data');
const DATA_DIR = process.env.WBWE_DATA_DIR
  ? path.resolve(process.env.WBWE_DATA_DIR)
  : (configuredDataDir() || DEFAULT_DATA_DIR);

module.exports = {
  BUNDLE_DIR,
  APP_DIR,
  APP_ID,
  APP_NAME,
  APP_NAME_EN,
  LEGACY_APP_IDS,
  EXE_NAME,
  DATA_PATH_FILE,
  DEFAULT_DATA_DIR,
  DATA_DIR,
};
