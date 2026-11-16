'use strict';

const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const cache = new Map();

function isPlaceholder(buffer) {
  return buffer.length < 120 || buffer.toString('utf8', 0, 400).includes('source-code-not-available');
}

// helpers/*.js.txt 以 assets 原样打包：pkg 会把 .js 编译成字节码，
// fs 读出来的只是 source-code-not-available 占位符。
// 运行时释放成可执行脚本，交给 WorkBuddy 自带的 Electron Node。
function helperPath(name) {
  if (cache.has(name)) return cache.get(name);
  const source = path.join(__dirname, '..', 'helpers', name + '.txt');
  let code;
  try {
    code = fs.readFileSync(source);
  } catch (error) {
    throw new Error('缺少辅助脚本资源 ' + name + '：' + error.message);
  }
  if (isPlaceholder(code)) throw new Error('辅助脚本资源 ' + name + ' 已损坏，请重新安装 workbuddyEVA');
  const dir = path.join(DATA_DIR, 'runtime');
  const target = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true });
  let current = null;
  try { current = fs.readFileSync(target); } catch (_) {}
  if (!current || !current.equals(code)) {
    // 先写临时文件再改名，避免 WorkBuddy Node 读到写了一半的脚本
    const temp = target + '.' + process.pid + '.tmp';
    fs.writeFileSync(temp, code);
    fs.renameSync(temp, target);
  }
  const written = fs.readFileSync(target);
  if (!written.equals(code)) throw new Error('辅助脚本写入校验失败：' + target);
  cache.set(name, target);
  return target;
}

module.exports = { helperPath };
