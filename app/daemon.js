'use strict';

// 自有常驻入口：启动壁纸 HTTP 服务，自动唤起 WorkBuddy 并注入面板；
// WorkBuddy 退出后本程序随之退出。全程不打开浏览器。
const fs = require('fs');
const path = require('path');
const { APP_ID, APP_NAME, LEGACY_APP_IDS, DATA_DIR } = require('../lib/paths');

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

  const workbuddy = require('./workbuddy');
  const cdp = require('../lib/cdp');
  const inject = require('../lib/inject');
  const ui = require('../lib/native-ui');
  const cdpPort = Number(process.env.WBWE_CDP_PORT) || workbuddy.DEFAULT_PORT;

  let closing = false;
  let watcher = null;
  async function shutdown() {
    if (closing) return;
    closing = true;
    if (watcher) clearInterval(watcher);
    log('正在退出…');
    try { await cdp.evaluate(inject.buildDispose, { timeout: 2500 }); } catch (_) {}
    try { info.server.close(); } catch (_) {}
    await sleep(120);
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 未显式要求重启时，先按“直接连接 / 启动未运行的 WorkBuddy”处理；
  // 运行中但没有 CDP 则用原生对话框征得同意后再重启。
  const preauthorized = process.argv.includes('--restart-workbuddy') || process.env.WBWE_RESTART_WORKBUDDY === '1';
  let result = null;
  try {
    result = await workbuddy.ensureCdp({ port: cdpPort, restart: preauthorized, log });
  } catch (error) {
    if (error.code === 'NEED_RESTART') {
      const ok = ui.confirm('WorkBuddy 正在运行，但没有开启调试通道，无法注入壁纸与面板。\n\n需要重启一次 WorkBuddy 才能继续。未保存的会话可能丢失，是否现在重启？', 'No');
      if (!ok) {
        log('用户取消了重启 WorkBuddy，退出');
        ui.info(APP_NAME + ' 已退出。退出 WorkBuddy 后重新启动本程序，会自动唤起它。');
        await shutdown();
        return;
      }
      log('用户确认重启 WorkBuddy');
      try {
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

  workbuddy.rememberPort(result.port);
  log('WorkBuddy CDP 已就绪: ' + result.port
    + (result.launched ? '（已由本程序启动）' : '')
    + (result.restarted ? '（已重启）' : ''));

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
