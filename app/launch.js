'use strict';

// 打包入口：优先加载安装目录里的可更新负载（payload/），
// 负载缺失或加载失败时回退到上一版本备份，最后回退到 exe 内嵌代码。
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
const PAYLOAD = path.join(ROOT, 'payload');
const BACKUP = path.join(ROOT, 'payload.bak');

function entryOf(dir) {
  return path.join(dir, 'app', 'daemon.js');
}

function selfCheck() {
  const candidates = [entryOf(PAYLOAD), entryOf(BACKUP), path.join(__dirname, 'daemon.js')];
  const report = {
    pkg: Boolean(process.pkg),
    exe: process.execPath,
    root: ROOT,
    payload: fs.existsSync(entryOf(PAYLOAD)),
    backup: fs.existsSync(entryOf(BACKUP)),
    entry: candidates.find((file) => fs.existsSync(file)) || '',
    candidates,
  };
  fs.writeFileSync(path.join(os.tmpdir(), 'workbuddy-eva-app-selfcheck.json'),
    JSON.stringify(report, null, 2));
  return report;
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  return;
}

const candidates = [entryOf(PAYLOAD), entryOf(BACKUP), path.join(__dirname, 'daemon.js')];
let lastError = null;

// pkg 的 require 只认快照内文件；外部 payload 用 Module 手动编译，
// 其内部 require 仍按真实路径解析，能正常加载 payload 里的依赖。
function loadExternal(entry) {
  const Module = require('module');
  const mod = new Module(entry, module);
  mod.filename = entry;
  mod.paths = Module._nodeModulePaths(path.dirname(entry));
  Module._cache[entry] = mod;
  mod._compile(fs.readFileSync(entry, 'utf8'), entry);
}

for (const entry of candidates) {
  if (!fs.existsSync(entry)) continue;
  try {
    const external = process.pkg && !entry.startsWith(path.join(process.execPath, '..') + path.sep);
    if (external) loadExternal(entry);
    else require(entry);
    lastError = null;
    break;
  } catch (error) {
    lastError = { entry, error };
    try { console.error('[launch] 无法加载 ' + entry + ': ' + (error && error.message || error)); } catch (_) {}
  }
}

if (lastError) {
  try {
    const line = '[' + new Date().toISOString() + '] 启动失败: 所有负载都无法加载，最后错误 '
      + (lastError.error && lastError.error.message || lastError.error) + '\n';
    fs.appendFileSync(path.join(os.tmpdir(), 'workbuddy-eva-launch-error.log'), line);
  } catch (_) {}
  process.exit(1);
}