'use strict';

// 电脑电源策略：允许休眠 / 保持唤醒 / 任务结束后自动解除，外加立即休眠。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR } = require('./paths');

const FILE = path.join(DATA_DIR, 'wb', 'power.json');
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

let holder = null;
let untilTimer = 0;
let idleHits = 0;
let mode = 'allow';
let displaySleep = false;

function persist() {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify({ mode, displaySleep }, null, 2), { mode: 0o600 });
  } catch (_) {}
}

function stopHolder() {
  const child = holder;
  holder = null;
  if (!child) return;
  try {
    if (!IS_WIN && child.pid) process.kill(-child.pid, 'SIGTERM');
    else child.kill();
  } catch (_) {}
}

function startHolder() {
  stopHolder();
  if (IS_WIN) {
    // ES_CONTINUOUS | ES_SYSTEM_REQUIRED [| ES_DISPLAY_REQUIRED]
    const flags = displaySleep ? '0x80000001' : '0x80000003';
    const script = "Add-Type -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e);' -Name WBHost -Namespace WBWE -PassThru | Out-Null; while($true){ [WBWE.WBHost]::SetThreadExecutionState(" + flags + '); Start-Sleep -Seconds 90 }';
    const child = spawn('powershell', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => { if (holder === child) holder = null; });
    child.on('exit', () => { if (holder === child) holder = null; });
    holder = child;
    return;
  }
  if (IS_MAC) {
    const args = displaySleep ? ['-i', '-s', '-m'] : ['-d', '-i', '-s', '-m'];
    const child = spawn('caffeinate', args, { stdio: 'ignore' });
    child.on('error', () => { if (holder === child) holder = null; });
    child.on('exit', () => { if (holder === child) holder = null; });
    holder = child;
    return;
  }
  const child = spawn('systemd-inhibit', [
    '--what=' + (displaySleep ? 'sleep' : 'sleep:idle'),
    '--mode=block',
    '--who=Wallpaper Engine',
    '--why=正在保持 WorkBuddy 任务运行',
    'sleep',
    'infinity',
  ], { stdio: 'ignore', detached: true });
  child.on('error', () => { if (holder === child) holder = null; });
  child.on('exit', () => { if (holder === child) holder = null; });
  holder = child;
}

function stopUntilWatch() {
  if (untilTimer) { clearInterval(untilTimer); untilTimer = 0; }
  idleHits = 0;
}

function startUntilWatch() {
  stopUntilWatch();
  untilTimer = setInterval(async () => {
    if (mode !== 'until-done') { stopUntilWatch(); return; }
    let active = 1;
    try { active = await require('./wb-sessions').activeCount(); } catch (_) { return; }
    if (active > 0) { idleHits = 0; return; }
    idleHits += 1;
    if (idleHits < 2) return;
    mode = 'allow';
    persist();
    stopHolder();
    stopUntilWatch();
  }, 60000);
  if (untilTimer.unref) untilTimer.unref();
}

function apply(nextMode, nextDisplay) {
  mode = ['keep', 'until-done'].includes(nextMode) ? nextMode : 'allow';
  displaySleep = !!nextDisplay;
  persist();
  stopUntilWatch();
  if (mode === 'allow') {
    stopHolder();
    return status();
  }
  startHolder();
  if (mode === 'until-done') startUntilWatch();
  return status();
}

function status() {
  return {
    mode,
    displaySleep,
    preventing: mode === 'keep' || mode === 'until-done',
    active: !!holder,
    platform: process.platform,
  };
}

function sleepNow() {
  try {
    if (IS_WIN) {
      const child = spawn('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0'], { stdio: 'ignore', windowsHide: true });
      child.on('error', () => {});
      return true;
    }
    if (IS_MAC) {
      const child = spawn('pmset', ['sleepnow'], { stdio: 'ignore' });
      child.on('error', () => {});
      return true;
    }
    const child = spawn('systemctl', ['suspend'], { stdio: 'ignore' });
    child.on('error', () => {});
    return true;
  } catch (_) {
    return false;
  }
}

function restore() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const savedMode = ['keep', 'until-done'].includes(data.mode) ? data.mode : 'allow';
    if (savedMode !== 'allow') apply(savedMode, !!data.displaySleep);
    else { mode = 'allow'; displaySleep = !!data.displaySleep; }
  } catch (_) {
    mode = 'allow';
    displaySleep = false;
  }
}

module.exports = { status, apply, sleepNow, restore, FILE };
