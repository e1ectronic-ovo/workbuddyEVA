'use strict';

// 自有常驻入口：启动壁纸 HTTP 服务，自动唤起 WorkBuddy 并注入面板；
// WorkBuddy 退出后本程序随之退出。全程不打开浏览器。
const fs = require('fs');
const path = require('path');
const { APP_ID, APP_NAME, LEGACY_APP_IDS, DATA_DIR } = require('../lib/paths');
const ui = require('../lib/native-ui');
const instanceLock = require('../lib/instance-lock');

const LOG_FILE = path.join(DATA_DIR, 'daemon.log');
const PORT = Math.max(1024, Math.min(65535, parseInt(process.env.WBWE_PORT || '47850', 10) || 47850));

function log(...args) {
  const line = '[' + new Date().toISOString() + '] ' + args.join(' ');
  // 打包后的 exe 没有控制台窗口，stdout 可能不可写；日志仍写入数据目录
  try { console.log(line); } catch (_) {}
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) {}
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function runningApp() {
  try {
    const res = await fetch('http://127.0.0.1:' + PORT + '/api/health', { signal: AbortSignal.timeout(1200) });
    if (!res.ok) return null;
    const info = await res.json();
    return info && (info.app === APP_ID || LEGACY_APP_IDS.includes(info.app)) ? info : null;
  } catch (_) {
    return null;
  }
}

async function main() {
  if (typeof fetch !== 'function') {
    throw new Error('需要 Node.js 22+（当前版本缺少 fetch）');
  }
  if (!(await instanceLock.acquire())) {
    log(APP_NAME + ' 已在运行，本次启动已忽略');
    ui.info(APP_NAME + ' 已经在运行，无需重复启动。');
    return;
  }
  const running = await runningApp();
  if (running) {
    if (running.app === APP_ID) {
      log(APP_NAME + ' 已在运行');
    } else {
      log('检测到旧版本实例仍占用端口 ' + PORT + '，请先退出旧版本再重新启动');
    }
    return;
  }

  const { start } = require('../server');
  const info = await start({ port: PORT });
  log(APP_NAME + ' 已启动（数据目录: ' + DATA_DIR + '）');

  // 按合并约定完全替代已安装的 WorkDaddy：先结束它的看门狗与守护进程，
  // 否则两边会同时抢 CDP、切账号和复制会话。
  const guard = require('../lib/workdaddy-guard');
  let workdaddy = { stopped: 0, remaining: 0 };
  try { workdaddy = guard.stop(); } catch (_) {}
  if (workdaddy.stopped) log('已结束 WorkDaddy 后台进程 ' + workdaddy.stopped + ' 个');
  if (workdaddy.remaining) log('警告：WorkDaddy 仍有 ' + workdaddy.remaining + ' 个后台进程未结束');

  const workbuddy = require('./workbuddy');
  const cdp = require('../lib/cdp');
  const inject = require('../lib/inject');
  const cdpPort = Number(process.env.WBWE_CDP_PORT) || workbuddy.DEFAULT_PORT;

  let closing = false;
  let injected = false;
  let watcher = null;
  async function shutdown() {
    if (closing) return;
    closing = true;
    if (watcher) clearInterval(watcher);
    log('正在退出…');
    if (injected) { try { await cdp.evaluate(inject.buildDispose, { timeout: 2500 }); } catch (_) {} }
    try { info.server.close(); } catch (_) {}
    instanceLock.release();
    await sleep(120);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 已有可用的调试通道（本程序上次启动的实例、WorkDaddy 或手动带参启动）直接复用；
  // 只有 WorkBuddy 在跑却没有 CDP 时才需要重启，避免每次启动都强制重启用户会话。
  // --restart-workbuddy / WBWE_RESTART_WORKBUDDY=1 视为已授权，需要重启时不再询问。
  const preauthorized = process.argv.includes('--restart-workbuddy') || process.env.WBWE_RESTART_WORKBUDDY === '1';

  let result = null;
  try {
    result = await workbuddy.ensureCdp({ port: cdpPort, restart: preauthorized, log });
  } catch (error) {
    if (error.code === 'NEED_RESTART') {
      const ok = preauthorized || ui.confirm('WorkBuddy 正在运行，但没有开启调试通道。\n\n需要重启一次 WorkBuddy 才能继续。未保存的会话可能丢失，是否现在重启？', 'No');
      if (!ok) {
        log('用户取消了重启 WorkBuddy，退出');
        ui.info(APP_NAME + ' 已退出。退出 WorkBuddy 后重新启动本程序，会自动唤起它。');
        await shutdown();
        return;
      }
      log('用户确认重启 WorkBuddy');
      try {
        await workbuddy.stopWorkBuddy();
        result = await workbuddy.ensureCdp({ port: cdpPort, restart: true, log });
      } catch (retryError) {
        log('重启 WorkBuddy 失败: ' + retryError.message);
        ui.info('无法启动 WorkBuddy：' + retryError.message);
        await shutdown();
        return;
      }
    } else {
      log('无法连接 WorkBuddy: ' + error.message);
      if (error.code === 'NEED_WORKBUDDY') {
        ui.info('未找到 WorkBuddy.exe。\n\n请安装 WorkBuddy 桌面客户端，或用环境变量 WBWE_WORKBUDDY_BIN 指定完整路径。');
      } else {
        ui.info('无法启动 WorkBuddy：' + error.message);
      }
      await shutdown();
      return;
    }
  }

  injected = true;
  workbuddy.rememberPort(result.port);
  log('WorkBuddy CDP 已就绪: ' + result.port
    + (result.launched ? '（已由本程序启动）' : '')
    + (result.restarted ? '（已重启）' : ''));
  // 复用的是别人打开的页面时，旧注入里的端口/令牌可能已失效；先卸载，交给 watchdog 用本次配置重新注入。
  if (!result.launched && !result.restarted) {
    try { await cdp.evaluate(inject.buildDispose, { timeout: 3000 }); } catch (_) {}
  }
  // WorkDaddy 被杀掉后已经绘制的面板和主题还在页面里，刷新一次交给本程序重新注入。
  if (workdaddy.stopped && !result.launched && !result.restarted) {
    try {
      await cdp.evaluate('location.reload()', { timeout: 2000 });
      log('已刷新 WorkBuddy 界面，清除 WorkDaddy 残留');
    } catch (_) {}
  }

  // WorkBuddy 退出后本程序随之退出：tasklist 轻量轮询，连续 3 次未命中才判定退出
  let misses = 0;
  watcher = setInterval(() => {
    if (closing) return;
    if (workbuddy.isRunning()) { misses = 0; return; }
    misses += 1;
    if (misses >= 3) {
      log('WorkBuddy 已退出，' + APP_NAME + ' 随之退出');
      shutdown();
    }
  }, 4000);
}

main().catch((error) => {
  log('启动失败: ' + (error && error.message || error));
  process.exit(1);
});
