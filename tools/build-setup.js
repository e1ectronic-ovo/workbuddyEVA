'use strict';

// 组装安装包：应用 exe + 图标 → installer/payload → 以 installer 为入口打出一个 Setup.exe。
// 安装包与应用共用 tools/pkg-build.js 的图标 / 版本 / GUI 子系统处理。

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { buildPackage } = require('./pkg-build');

const ROOT = path.join(__dirname, '..');
const APP_EXE = path.join(ROOT, 'dist', 'workbuddyEVA.exe');
const OUT = path.join(ROOT, 'dist', 'workbuddyEVA-Setup.exe');
const INSTALLER = path.join(ROOT, 'installer');
const PAYLOAD = path.join(INSTALLER, 'payload');
const META = require(path.join(ROOT, 'package.json'));

if (!fs.existsSync(APP_EXE) || process.argv.includes('--build-app')) {
  console.log('[setup] 先构建应用本体...');
  const build = spawnSync(process.execPath, [path.join(__dirname, 'build-exe.js')], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status || 1);
}

fs.mkdirSync(PAYLOAD, { recursive: true });
fs.copyFileSync(APP_EXE, path.join(PAYLOAD, 'workbuddyEVA.exe'));
fs.copyFileSync(path.join(ROOT, 'assets', 'app.ico'), path.join(PAYLOAD, 'app.ico'));
fs.writeFileSync(path.join(INSTALLER, 'meta.json'), JSON.stringify({
  version: META.version,
  productName: META.productName,
}, null, 2) + '\n');
console.log('[setup] 已准备安装内容: ' + (fs.statSync(path.join(PAYLOAD, 'workbuddyEVA.exe')).size / 1048576).toFixed(1) + ' MB');

buildPackage({
  input: INSTALLER,
  output: OUT,
  description: 'workbuddyEVA 安装程序',
  internalName: 'workbuddyEVASetup',
  originalFilename: 'workbuddyEVA-Setup.exe',
});
