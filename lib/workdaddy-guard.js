'use strict';

// WorkDaddy 的守护与看门狗会和本程序同时抢 CDP、切账号、复制会话。
// 合并版按约定完全替代它：启动时结束它的后台进程，由本程序独占 WorkBuddy 注入。
const { execFileSync } = require('child_process');

const MATCH = "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'WorkDaddyLauncher.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'WorkDaddy.*(daemon|watchdog)\\.js') }";

function stop(options = {}) {
  if (process.platform !== 'win32') return { stopped: 0, remaining: 0 };
  const dryRun = options.dryRun ? '$true' : '$false';
  // 先看门狗后守护：反过来会被看门狗立刻拉起来。
  const script = [
    "$ErrorActionPreference='SilentlyContinue';",
    '$DryRun = ' + dryRun + ';',
    '$list = @(' + MATCH + ');',
    "$list = $list | Sort-Object { if ($_.CommandLine -match 'watchdog') { 0 } else { 1 } };",
    '$count = 0;',
    'foreach ($p in $list) {',
    '  if (-not $DryRun) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; $count++ } catch {} }',
    '  else { $count++ }',
    '}',
    'Start-Sleep -Milliseconds 400;',
    '$left = @(' + MATCH + ').Count;',
    'Write-Output ($count.ToString() + " " + $left.ToString())',
  ].join(' ');
  let out = '';
  try {
    out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8', timeout: 15000, windowsHide: true,
    }).trim();
  } catch (_) {
    return { stopped: 0, remaining: 0, error: true };
  }
  const match = out.match(/(\d+)\s+(\d+)\s*$/);
  if (!match) return { stopped: 0, remaining: 0, error: true };
  return { stopped: Number(match[1]) || 0, remaining: Number(match[2]) || 0 };
}

module.exports = { stop };
