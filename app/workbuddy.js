'use strict';

// WorkBuddy 进程与 CDP 调试通道：查找安装、检测调试端口、按需启动/重启。
// 只依赖公开的命令行参数与 CDP HTTP 接口，不读取任何 WorkDaddy 数据。
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { DATA_DIR } = require('../lib/paths');

const PORT_FILE = path.join(DATA_DIR, 'cdp-port.json');
const DEFAULT_PORT = 9222;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function shortcutTargets() {
  if (process.platform !== 'win32') return [];
  const dirs = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean);
  const script = ['$w = New-Object -ComObject WScript.Shell'].concat(
    dirs.map((dir) => 'Get-ChildItem -LiteralPath ' + psQuote(dir)
      + ' -Filter *WorkBuddy*.lnk -Recurse -ErrorAction SilentlyContinue'
      + ' | ForEach-Object { $w.CreateShortcut($_.FullName).TargetPath }'),
  ).join('\n');
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script],
      { encoding: 'utf8', timeout: 6000, windowsHide: true });
    return out.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function psQuote(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

function candidates() {
  const list = [];
  if (process.env.WBWE_WORKBUDDY_BIN) list.push(process.env.WBWE_WORKBUDDY_BIN);
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  list.push(
    path.join(local, 'Programs', 'WorkBuddy', 'WorkBuddy.exe'),
    path.join(local, 'WorkBuddy', 'WorkBuddy.exe'),
    path.join(pf, 'WorkBuddy', 'WorkBuddy.exe'),
    path.join(pf86, 'WorkBuddy', 'WorkBuddy.exe'),
  );
  return list.concat(shortcutTargets());
}

function existingFile(file) {
  try { return fs.statSync(file).isFile(); } catch (_) { return false; }
}

function runningProcesses() {
  if (process.platform !== 'win32') return [];
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='WorkBuddy.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine,ThreadCount | ConvertTo-Json -Compress",
    ], { encoding: 'utf8', timeout: 6000, windowsHide: true }).trim();
    if (!out) return [];
    const parsed = JSON.parse(out);
    // 已终止但句柄未释放的僵尸进程仍会被枚举，但线程数为 0，不能当作“WorkBuddy 仍在运行”
    return (Array.isArray(parsed) ? parsed : [parsed])
      .filter((row) => row && (row.ExecutablePath || row.CommandLine) && Number(row.ThreadCount) > 0)
      .map((row) => ({
        pid: Number(row.ProcessId) || 0,
        exe: row.ExecutablePath || '',
        command: row.CommandLine || '',
      }));
  } catch (_) {
    return [];
  }
}

// 轻量进程检测：tasklist 比 PowerShell 查询快，供“WorkBuddy 退出后自动退出”轮询使用。
// STATUS ne Unknown 排除已退出但句柄未释放的僵尸进程（它们会让轮询误以为 WorkBuddy 还在）。
function isRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq WorkBuddy.exe', '/FI', 'STATUS ne Unknown', '/NH'], {
      encoding: 'utf8', timeout: 4000, windowsHide: true,
    });
    return /WorkBuddy\.exe/i.test(out);
  } catch (_) {
    return false;
  }
}

function findExecutable() {
  const found = candidates().find(existingFile);
  if (found) return found;
  const running = runningProcesses().find((row) => row.exe);
  return running ? running.exe : '';
}

function advertisedPort(command) {
  const match = /--remote-debugging-port=(\d+)/.exec(command || '');
  return match ? Number(match[1]) : 0;
}

async function probe(port) {
  try {
    const res = await fetch('http://127.0.0.1:' + port + '/json/version', { signal: AbortSignal.timeout(800) });
    if (!res.ok) return false;
    const info = await res.json();
    return Boolean(info && info.webSocketDebuggerUrl);
  } catch (_) {
    return false;
  }
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function pickLaunchPort(preferred) {
  for (let port = preferred; port <= preferred + 10 && port <= 65535; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error('9222-9232 没有可用端口');
}

// CDP 端点偶尔会被正在启动/关闭的页面短暂拖慢，多次探测避免误判“没有开启 CDP”
async function probeReady(port, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    if (await probe(port)) return true;
    if (i < attempts - 1) await sleep(400);
  }
  return false;
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe(port)) return true;
    await sleep(500);
  }
  return false;
}

function rememberPort(port) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PORT_FILE, JSON.stringify({ port, updatedAt: new Date().toISOString() }));
  } catch (_) {}
}

async function stopWorkBuddy() {
  try { execFileSync('taskkill', ['/IM', 'WorkBuddy.exe'], { timeout: 5000, windowsHide: true }); } catch (_) {}
  await sleep(1500);
  if (!runningProcesses().length) return;
  try { execFileSync('taskkill', ['/IM', 'WorkBuddy.exe', '/F'], { timeout: 5000, windowsHide: true }); } catch (_) {}
  await sleep(800);
}

/**
 * 确保 WorkBuddy 暴露 CDP：
 * 1) 已有可用 CDP（含其他工具启动的实例）→ 直接复用；
 * 2) 未运行 → 以调试端口启动；
 * 3) 正在运行但没有调试端口 → 只有显式 restart=true 才重启，避免误杀用户会话。
 */
async function ensureCdp(options = {}) {
  const preferred = Number(options.port) || DEFAULT_PORT;
  const timeoutMs = Number(options.timeoutMs) || 30000;
  const log = typeof options.log === 'function' ? options.log : () => {};

  if (await probeReady(preferred)) return { port: preferred, launched: false, restarted: false };

  const running = runningProcesses();
  for (const row of running) {
    const port = advertisedPort(row.command);
    if (port && port !== preferred && await probeReady(port, 2)) {
      return { port, launched: false, restarted: false };
    }
  }

  const executable = findExecutable();
  if (!executable) {
    const error = new Error('未找到 WorkBuddy.exe，可用 WBWE_WORKBUDDY_BIN 指定完整路径');
    error.code = 'NEED_WORKBUDDY';
    throw error;
  }

  let restarted = false;
  if (running.length) {
    if (!options.restart) {
      const error = new Error('WorkBuddy 正在运行但没有开启 CDP');
      error.code = 'NEED_RESTART';
      throw error;
    }
    log('WorkBuddy 未开启 CDP，正在重启…');
    await stopWorkBuddy();
    restarted = true;
  }

  const port = await pickLaunchPort(preferred);
  log('启动 WorkBuddy（CDP ' + port + '）: ' + executable);
  const child = spawn(executable, ['--remote-debugging-port=' + port], {
    cwd: path.dirname(executable),
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  if (!(await waitForPort(port, timeoutMs))) {
    throw new Error('启动 WorkBuddy 后等待 CDP 端口 ' + port + ' 超时');
  }
  rememberPort(port);
  return { port, launched: true, restarted };
}

module.exports = { ensureCdp, probe, findExecutable, isRunning, runningProcesses, rememberPort, stopWorkBuddy, DEFAULT_PORT };
