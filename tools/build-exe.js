'use strict';

const fs = require('fs');
const path = require('path');
const { buildPackage } = require('./pkg-build');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist', 'workbuddyEVA.exe');

if (!fs.existsSync(path.join(ROOT, 'assets', 'app.ico'))) throw new Error('缺少图标文件: assets/app.ico');

buildPackage({
  input: ROOT,
  output: OUT,
  description: 'workbuddyEVA',
  internalName: 'workbuddyEVA',
  originalFilename: 'workbuddyEVA.exe',
});
