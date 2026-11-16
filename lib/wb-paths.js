'use strict';

// WorkBuddy 桌面端的数据位置。国内版与国际版数据互相独立。
const os = require('os');
const path = require('path');

const home = os.homedir();

function localSupportRoot() {
  if (process.platform === 'win32') return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  return process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
}

const AUTH_DIR = path.join(localSupportRoot(), 'CodeBuddyExtension', 'Data', 'Public', 'auth');

function profile() {
  const id = String(process.env.WBWE_WB_PROFILE || 'cn').toLowerCase() === 'ai' ? 'ai' : 'cn';
  if (id === 'ai') {
    return {
      id,
      name: 'WorkBuddy AI',
      dataRoot: path.join(home, '.workbuddy-ai'),
      authFile: path.join(AUTH_DIR, 'workbuddy-desktop-ai.info'),
      sessionDb: path.join(home, '.workbuddy-ai', 'workbuddy.db'),
      modelsFile: path.join(home, '.workbuddy-ai', 'models.json'),
      settingsFile: path.join(home, '.workbuddy-ai', 'settings.json'),
      apiHost: 'https://www.workbuddy.ai',
      region: 'intl',
    };
  }
  return {
    id,
    name: 'WorkBuddy',
    dataRoot: path.join(home, '.workbuddy'),
    authFile: path.join(AUTH_DIR, 'workbuddy-desktop.info'),
    sessionDb: path.join(home, '.workbuddy', 'workbuddy.db'),
    modelsFile: path.join(home, '.workbuddy', 'models.json'),
    settingsFile: path.join(home, '.workbuddy', 'settings.json'),
    apiHost: 'https://www.codebuddy.cn',
    region: 'cn',
  };
}

module.exports = { profile, AUTH_DIR };
