'use strict';

const fs = require('fs');
const path = require('path');
const { BUNDLE_DIR, DATA_DIR } = require('./paths');

// 首次运行时把旧版配置迁到当前数据目录（安装器新选的数据目录也适用）。
function candidates() {
  const appData = process.env.APPDATA || '';
  return [
    appData && path.join(appData, 'Asuka Wallpaper', 'data'),
    appData && path.join(appData, 'workbuddyEVA', 'data'),
    appData && path.join(appData, 'WorkBuddy Wallpaper Engine', 'data'),
    appData && path.join(appData, 'WorkDaddy', 'wallpaper'),
    appData && path.join(appData, 'workbuddy-wallpaper-engine', 'data'),
    path.join(BUNDLE_DIR, 'data'),
  ].filter((dir) => dir && path.resolve(dir) !== path.resolve(DATA_DIR));
}

function migrate() {
  try {
    if (fs.existsSync(path.join(DATA_DIR, 'config.json'))) return;
    const source = candidates().find((dir) => fs.existsSync(path.join(dir, 'config.json')));
    if (!source) return;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.cpSync(source, DATA_DIR, { recursive: true, force: false, errorOnExist: false });
    console.log('[wbwe] 已迁移旧壁纸配置: ' + source + ' -> ' + DATA_DIR);
  } catch (_) {}
}

module.exports = { migrate };
