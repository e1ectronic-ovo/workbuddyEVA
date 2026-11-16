'use strict';

// 与 WorkBuddy 渲染进程通信：独立发现本机已开启的 CDP 调试端口并注入壁纸层，
// 不依赖 WorkDaddy 是否安装/运行，也不修改 WorkBuddy 的任何文件。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { DATA_DIR } = require('./paths');

let WebSocket = null;
try { WebSocket = require('ws'); } catch (_) { WebSocket = globalThis.WebSocket; }

const PORT_FILE = path.join(DATA_DIR, 'cdp-port.json');

let cachedPort = 0;
let cachedAt = 0;

function envPort() {
  const n = Number(process.env.WBWE_CDP_PORT);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// 本程序启动 WorkBuddy 时写入的端口，作为快速路径，没有也能正常扫描。
function filePort() {
  try {
    const json = JSON.parse(fs.readFileSync(PORT_FILE, 'utf8'));
    const n = Number(json.port);
    if (Number.isInteger(n) && n > 0) return n;
  } catch (_) {}
  return 0;
}

// 从 WorkBuddy 进程命令行里抠出它自己开的调试端口（用户手动带参数启动时也能发现）
function processPort() {
  if (process.platform !== 'win32') return 0;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='WorkBuddy.exe'\" | Select-Object -ExpandProperty CommandLine"],
      { encoding: 'utf8', timeout: 5000, windowsHide: true });
    const m = out.match(/--remote-debugging-port=(\d+)/);
    if (m) return Number(m[1]);
  } catch (_) {}
  return 0;
}

async function ping(p) {
  try {
    const res = await fetch('http://127.0.0.1:' + p + '/json/version', { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const info = await res.json();
    return !!info.webSocketDebuggerUrl;
  } catch (_) { return false; }
}

async function resolvePort(force) {
  if (!force && cachedPort && Date.now() - cachedAt < 15000) return cachedPort;
  // 显式指定 WBWE_CDP_PORT 时只认这个端口，避免多开 WorkBuddy 时误连到别的实例。
  const env = envPort();
  const list = env ? [env] : [];
  if (!env) {
    const file = filePort(); if (file) list.push(file);
    for (let p = 9222; p <= 9232; p++) list.push(p);
    const proc = processPort(); if (proc) list.push(proc);
  }
  const uniq = Array.from(new Set(list));
  const hits = await Promise.all(uniq.map(async p => ((await ping(p)) ? p : 0)));
  const found = hits.find(Boolean);
  if (!found) throw new Error(env ? ('WBWE_CDP_PORT 指定的调试端口 ' + env + ' 不可用') : '没有找到 WorkBuddy 调试端口（9222-9232 均未开放）');
  cachedPort = found;
  cachedAt = Date.now();
  return found;
}

// 同步取值：仅用于日志/面板展示，实际连接走 resolvePort()
function readCdpPort() { return cachedPort || envPort() || filePort() || 9222; }

let socket = null;
let connecting = null;
let seq = 0;
let port = 0;
let targetUrl = '';
const pending = new Map();

function rejectAll(error) {
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pending.clear();
}

async function pickTarget() {
  port = await resolvePort();
  let targets;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(4000) });
    targets = await res.json();
  } catch (err) {
    // 端口失效（WorkBuddy 重启后换了端口）→ 下次强制重新发现
    cachedPort = 0;
    cachedAt = 0;
    throw new Error('连接 WorkBuddy 调试端口 ' + port + ' 失败：' + err.message);
  }
  const pages = targets.filter(t => t.type === 'page');
  const page = pages.find(t => /renderer\/index\.html/.test(t.url) && /workbuddy/i.test(t.url))
    || pages.find(t => /renderer\/index\.html/.test(t.url))
    || pages[0];
  if (!page) throw new Error('没有找到 WorkBuddy 页面（WorkBuddy 是否正在运行？）');
  targetUrl = page.url;
  return page;
}

async function ensure() {
  if (socket && socket.readyState === 1) return;
  if (connecting) return connecting;
  connecting = (async () => {
    const page = await pickTarget();
    const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024, handshakeTimeout: 5000 });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('连接 WorkBuddy 调试端口超时')), 6000);
      ws.once('open', () => { clearTimeout(timer); resolve(); });
      ws.once('error', err => { clearTimeout(timer); reject(err); });
    });
    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
      const hit = msg.id && pending.get(msg.id);
      if (!hit) return;
      pending.delete(msg.id);
      clearTimeout(hit.timer);
      if (msg.error) hit.reject(new Error(msg.error.message || 'CDP 调用失败'));
      else hit.resolve(msg.result);
    });
    ws.on('close', () => {
      if (socket === ws) socket = null;
      rejectAll(new Error('WorkBuddy 调试连接已断开'));
    });
    ws.on('error', () => {});
    socket = ws;
  })().finally(() => { connecting = null; });
  return connecting;
}

function send(method, params, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} 超时`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, { timeout = 10000, awaitPromise = true } = {}) {
  await ensure();
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  }, timeout);
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception && result.exceptionDetails.exception.description;
    throw new Error(text || result.exceptionDetails.text || '注入脚本执行失败');
  }
  return result.result ? result.result.value : undefined;
}

async function status() {
  try {
    const value = await evaluate('(function(){return {url: location.href, installed: !!window.__wbwe, id: window.__wbwe ? window.__wbwe.id : "", visible: document.visibilityState};})()', { timeout: 4000 });
    return { connected: true, port, target: targetUrl, ...value };
  } catch (err) {
    return { connected: false, port: readCdpPort(), error: err.message };
  }
}

// WorkBuddy 因 GPU 崩溃降级为 SwiftShader 时，任何壁纸都会卡；面板据此提示用户重启
let gpuCache = { at: 0, value: { renderer: '', software: false } };

async function gpu() {
  if (gpuCache.at && Date.now() - gpuCache.at < 30000) return gpuCache.value;
  try {
    const renderer = await evaluate(
      '(function(){try{var c=document.createElement("canvas");var gl=c.getContext("webgl")||c.getContext("experimental-webgl");if(!gl)return "";var d=gl.getExtension("WEBGL_debug_renderer_info");return d?String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)):"";}catch(e){return "";}})()',
      { timeout: 4000 },
    );
    const text = String(renderer || '');
    gpuCache = { at: Date.now(), value: { renderer: text, software: /swiftshader|software|llvmpipe|basic render/i.test(text) } };
    return gpuCache.value;
  } catch (_) {
    return gpuCache.value;
  }
}

function reset() {
  if (socket) {
    try { socket.close(); } catch (_) {}
  }
  socket = null;
  cachedPort = 0;
  cachedAt = 0;
  gpuCache = { at: 0, value: { renderer: '', software: false } };
  rejectAll(new Error('连接已重置'));
}

module.exports = { evaluate, ensure, status, gpu, reset, readCdpPort, resolvePort };
