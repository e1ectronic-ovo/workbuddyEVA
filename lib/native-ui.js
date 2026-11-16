'use strict';

// 原生 Windows 对话框：启动过程中需要用户确认/知情时使用，不打开浏览器。
// WBWE_NO_UI=1 时只写日志，便于自动化验证。

const { spawnSync } = require('child_process');
const paths = require('./paths');

const ENABLED = process.platform === 'win32' && process.env.WBWE_NO_UI !== '1';

function psLiteral(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

function runPS(script) {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded,
  ], { windowsHide: true, stdio: 'ignore' });
}

function info(text) {
  if (!ENABLED) return;
  runPS('Add-Type -AssemblyName System.Windows.Forms;'
    + '[System.Windows.Forms.MessageBox]::Show(' + psLiteral(text) + ',' + psLiteral(paths.APP_NAME) + ",'OK','Information') | Out-Null");
}

function confirm(text, defaultButton) {
  if (!ENABLED) return false;
  const button = defaultButton === 'No' ? 'Button2' : 'Button1';
  const result = runPS('Add-Type -AssemblyName System.Windows.Forms;'
    + '$r=[System.Windows.Forms.MessageBox]::Show(' + psLiteral(text) + ',' + psLiteral(paths.APP_NAME) + ",'YesNo','Question','" + button + "');"
    + "if($r -eq 'Yes'){exit 0}else{exit 1}");
  return result.status === 0;
}

module.exports = { info, confirm, enabled: ENABLED };
