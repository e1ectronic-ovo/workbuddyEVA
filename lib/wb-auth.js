'use strict';

// WorkBuddy 登录态：解析 .info 登录文件、管理账号备份、切换登录。
// 备份与切换只做原始字节复制，不依赖 WorkBuddy 的加密格式；读取昵称/token 时才解密。
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DATA_DIR } = require('./paths');
const { profile } = require('./wb-paths');
const { helperPath } = require('./helper-path');

const WB_DIR = path.join(DATA_DIR, 'wb');
const ACCOUNTS_DIR = path.join(WB_DIR, 'accounts');
const BACKUPS_DIR = path.join(WB_DIR, 'backups');
const META_FILE = path.join(WB_DIR, 'accounts.json');

let cachedKey = null;
let keyFailedAt = 0;
let keyFailReason = '';
let keyError = '';
let cachedExe = '';

function isEnvelope(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && value.$wbEncrypted === 1 && typeof value.envelope === 'string';
}

function containsEnvelope(value) {
  if (isEnvelope(value)) return true;
  if (Array.isArray(value)) return value.some(containsEnvelope);
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(containsEnvelope);
}

function envelopeAad(env) {
  const lp = (text) => {
    const body = Buffer.from(String(text), 'utf8');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(body.length);
    return Buffer.concat([size, body]);
  };
  const u32 = (n) => {
    const size = Buffer.alloc(4);
    size.writeUInt32BE(n);
    return size;
  };
  return Buffer.concat([
    Buffer.from('WB-AAD\0', 'ascii'),
    Buffer.from([1]),
    lp('WBEV1'),
    lp('sym-v1'),
    u32(env.suite || 1),
    lp(env.keyId || ''),
    Buffer.from([2]),
    Buffer.from([0]),
    Buffer.from([0]),
  ]);
}

function openEnvelope(env, key) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(env.nonce, 'base64'), { authTagLength: 16 });
  decipher.setAAD(envelopeAad(env));
  decipher.setAuthTag(Buffer.from(env.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(env.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function workbuddyExe() {
  if (cachedExe) return cachedExe;
  try {
    const workbuddy = require('../app/workbuddy');
    cachedExe = workbuddy.findExecutable() || '';
  } catch (_) {
    cachedExe = '';
  }
  return cachedExe;
}

function staticKey() {
  if (cachedKey) return cachedKey;
  if (keyFailedAt && Date.now() - keyFailedAt < 60000) throw new Error(keyFailReason || '登录密钥暂不可用');
  const exe = workbuddyExe();
  if (!exe) throw new Error('未找到 WorkBuddy 主程序，无法读取加密登录信息');
  const helper = helperPath('wb-key-helper.js');
  const result = spawnSync(exe, [helper], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
    timeout: 15000,
    encoding: 'utf8',
    windowsHide: true,
  });
  const match = result.stdout && /WBWE_KEY ([A-Za-z0-9+/=]+)/.exec(result.stdout);
  if (!match) {
    keyFailedAt = Date.now();
    keyFailReason = '读取登录密钥失败（WorkBuddy 版本可能已变化）';
    throw new Error(keyFailReason);
  }
  cachedKey = Buffer.from(match[1], 'base64');
  return cachedKey;
}

function decryptJson(json) {
  if (!json || typeof json !== 'object') return json;
  if (!containsEnvelope(json)) return json;
  let key;
  try {
    key = staticKey();
    keyError = '';
  } catch (error) {
    keyError = (error && error.message) || '读取登录密钥失败';
    return json;
  }
  const walk = (node) => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    for (const name of Object.keys(node)) {
      const value = node[name];
      if (isEnvelope(value)) {
        try {
          const env = JSON.parse(Buffer.from(value.envelope, 'base64').toString('utf8'));
          node[name] = openEnvelope(env, key);
        } catch (_) {
          keyError = '登录信息解密失败（WorkBuddy 版本可能已变化）';
        }
      } else if (value && typeof value === 'object') {
        walk(value);
      }
    }
  };
  walk(json);
  return json;
}

function text(value) {
  if (typeof value === 'string') return value;
  return isEnvelope(value) ? '(已加密)' : '';
}

function authToken(auth) {
  if (!auth || typeof auth !== 'object') return '';
  const value = auth.accessToken ?? auth.access_token ?? auth.token;
  return typeof value === 'string' ? value.trim() : '';
}

function accountFromJson(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  return json.account || (Array.isArray(json.accounts) && json.accounts[0]) || null;
}

function recordFromFile(file, json, fallbackUid) {
  const acct = accountFromJson(json);
  const uid = String((acct && acct.uid) || fallbackUid || '');
  if (!uid) return null;
  const auth = json.auth && typeof json.auth === 'object' ? json.auth : {};
  return {
    uid,
    nickname: text(acct && acct.nickname),
    phone: text(acct && acct.phoneNumber),
    uin: typeof (acct && acct.uin) === 'string' || typeof (acct && acct.uin) === 'number' ? String(acct.uin) : '',
    type: typeof (acct && acct.type) === 'string' ? acct.type : '',
    enterpriseId: String((acct && acct.enterpriseId) || ''),
    enterpriseName: text(acct && acct.enterpriseName),
    tokenExpiresAt: auth.expiresAt || null,
    refreshExpiresAt: auth.refreshExpiresAt || null,
    lastRefreshTime: auth.lastRefreshTime || null,
    encrypted: containsEnvelope(acct) || containsEnvelope(auth),
  };
}

function readJson(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return decryptJson(json);
  } catch (_) {
    return null;
  }
}

function readMeta() {
  try {
    const json = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
    return {
      notes: json && typeof json.notes === 'object' ? json.notes : {},
      order: json && typeof json.order === 'object' ? json.order : {},
    };
  } catch (_) {
    return { notes: {}, order: {} };
  }
}

function writeMeta(meta) {
  fs.mkdirSync(WB_DIR, { recursive: true });
  const tmp = META_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2));
  fs.renameSync(tmp, META_FILE);
}

function backupPath(uid) {
  return path.join(ACCOUNTS_DIR, String(uid).replace(/[^A-Za-z0-9_-]/g, '_') + '.info');
}

function profilePaths() {
  return profile();
}

function canonicalAuthFile() {
  return profilePaths().authFile;
}

// WorkDaddy 把账号存成 accounts/<uid>.info，备注和排序放在 meta.json。
// 这里持续合并导入：升级、切换账号或删备份都不会让已有账号数据丢失。
function legacyRoots() {
  if (!process.env.APPDATA) return [];
  return [
    path.join(process.env.APPDATA, 'WorkDaddy'),
    path.join(process.env.APPDATA, 'WorkDaddy', 'profiles', 'workbuddy-cn'),
  ];
}

function importLegacyAccounts() {
  const meta = readMeta();
  let changed = false;
  for (const root of legacyRoots()) {
    const dir = path.join(root, 'accounts');
    let names = [];
    try { names = fs.readdirSync(dir); } catch (_) {}
    for (const name of names) {
      if (!name.endsWith('.info') || name.endsWith('.tmp')) continue;
      const target = path.join(ACCOUNTS_DIR, name);
      try {
        if (!fs.existsSync(target)) {
          fs.copyFileSync(path.join(dir, name), target, fs.constants.COPYFILE_EXCL);
        }
      } catch (_) {}
    }
    let source = null;
    try { source = JSON.parse(fs.readFileSync(path.join(root, 'meta.json'), 'utf8')); } catch (_) {}
    const accounts = source && source.accounts && typeof source.accounts === 'object' ? source.accounts : {};
    for (const uid of Object.keys(accounts)) {
      const row = accounts[uid] || {};
      if (typeof row.note === 'string' && row.note && !meta.notes[uid]) { meta.notes[uid] = row.note; changed = true; }
      if (Number.isSafeInteger(row.sort) && row.sort > 0 && !meta.order[uid]) { meta.order[uid] = row.sort; changed = true; }
    }
  }
  if (changed) writeMeta(meta);
}

function ensureMigrated() {
  try {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  } catch (_) {}
  try { importLegacyAccounts(); } catch (_) {}
  try { fs.writeFileSync(path.join(WB_DIR, '.legacy-imported'), new Date().toISOString()); } catch (_) {}
}

function safeStat(file) {
  try { return fs.statSync(file); } catch (_) { return null; }
}

function listBackups() {
  ensureMigrated();
  let names = [];
  try { names = fs.readdirSync(ACCOUNTS_DIR); } catch (_) {}
  const meta = readMeta();
  const current = currentAccount();
  const accountRows = [];
  for (const name of names) {
    if (!name.endsWith('.info') || name.endsWith('.tmp')) continue;
    const file = path.join(ACCOUNTS_DIR, name);
    const json = readJson(file);
    const record = recordFromFile(file, json || {}, name.replace(/\.info$/, ''));
    if (!record) continue;
    const stat = safeStat(file);
    const auth = json && json.auth && typeof json.auth === 'object' ? json.auth : {};
    const expiredAt = Number(auth.expiresAt) || 0;
    accountRows.push(Object.assign(record, {
      backupFile: name,
      savedAt: stat ? stat.mtimeMs : 0,
      note: meta.notes[record.uid] || '',
      order: meta.order[record.uid] || 0,
      current: !!current && current.uid === record.uid,
      tokenExpired: expiredAt > 0 && expiredAt < Date.now(),
    }));
  }
  accountRows.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    if (a.order !== b.order) return (a.order || 1e9) - (b.order || 1e9);
    return b.savedAt - a.savedAt;
  });
  return accountRows;
}

function currentAccount() {
  const file = canonicalAuthFile();
  if (!safeStat(file)) return null;
  const json = readJson(file);
  if (!json) return null;
  const record = recordFromFile(file, json, '');
  if (!record) return null;
  const auth = json.auth && typeof json.auth === 'object' ? json.auth : {};
  return Object.assign(record, {
    current: true,
    tokenExpired: (Number(auth.expiresAt) || 0) > 0 && Number(auth.expiresAt) < Date.now(),
    hasToken: !!authToken(auth) || containsEnvelope(auth.accessToken),
  });
}

function backupCurrent() {
  ensureMigrated();
  const file = canonicalAuthFile();
  if (!safeStat(file)) throw new Error('尚未登录 WorkBuddy，未找到登录信息文件');
  const json = readJson(file);
  const record = recordFromFile(file, json || {}, '');
  if (!record) throw new Error('登录信息缺少账号 uid，无法备份');
  const target = backupPath(record.uid);
  const raw = fs.readFileSync(file);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, raw);
  try { fs.chmodSync(tmp, 0o600); } catch (_) {}
  fs.renameSync(tmp, target);
  try { fs.chmodSync(target, 0o600); } catch (_) {}
  return Object.assign(record, { backupFile: path.basename(target), current: true });
}

function removeLogoutMarker() {
  const marker = canonicalAuthFile() + '.logged-out';
  if (!fs.existsSync(marker)) return;
  const retired = marker + '.retired.' + process.pid + '.' + Date.now();
  try {
    fs.renameSync(marker, retired);
    try { fs.unlinkSync(retired); } catch (_) {}
  } catch (_) {}
}

function switchAccount(uid) {
  ensureMigrated();
  const source = backupPath(uid);
  if (!safeStat(source)) throw new Error('未找到该账号的备份');
  const json = readJson(source);
  const record = recordFromFile(source, json || {}, uid);
  if (!record || record.uid !== String(uid)) throw new Error('备份校验失败：账号 uid 不匹配');
  const target = canonicalAuthFile();
  const raw = fs.readFileSync(source);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = target + '.wbs.tmp';
  fs.writeFileSync(tmp, raw);
  try { fs.chmodSync(tmp, 0o600); } catch (_) {}
  fs.renameSync(tmp, target);
  try { fs.chmodSync(target, 0o600); } catch (_) {}
  removeLogoutMarker();
  return record;
}

// 当前登录账号还没有备份时自动存一份，登录新账号后无需手动备份
function ensureCurrentBackedUp() {
  const current = currentAccount();
  if (!current || !current.uid) return null;
  if (safeStat(backupPath(current.uid))) return null;
  return backupCurrent();
}

// 登录新账号：备份当前登录态 → 退出 WorkBuddy → 删除登录文件 → 带 CDP 重新打开登录页。
// 备份仍保留，可在面板切回；新账号登录完成后由 ensureCurrentBackedUp 自动入库。
async function prepareNewLogin(options = {}) {
  const workbuddy = require('../app/workbuddy');
  const log = typeof options.log === 'function' ? options.log : () => {};
  // 先确认能重新拉起 WorkBuddy，避免删了登录文件却打不开登录页
  const executable = workbuddy.findExecutable();
  if (!executable) throw new Error('未找到 WorkBuddy.exe，无法重启到登录页');
  let backedUp = null;
  if (safeStat(canonicalAuthFile())) {
    backedUp = backupCurrent();
    log('[login] 已备份当前账号 ' + (backedUp.nickname || backedUp.uid));
  }
  await workbuddy.stopWorkBuddy();
  const file = canonicalAuthFile();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    log('[login] 已删除当前登录文件');
  } else {
    log('[login] 当前没有登录文件，直接打开登录页');
  }
  const port = Number(options.port) || Number(process.env.WBWE_CDP_PORT) || 9222;
  const result = await workbuddy.ensureCdp({ port, log });
  return { backedUp, port: result.port };
}

function deleteAccount(uid) {
  const file = backupPath(uid);
  if (!safeStat(file)) throw new Error('未找到该账号的备份');
  const current = currentAccount();
  if (current && current.uid === String(uid)) throw new Error('不能删除当前正在使用的账号');
  const trash = path.join(BACKUPS_DIR, 'deleted-' + Date.now() + '-' + path.basename(file));
  fs.renameSync(file, trash);
  return { uid: String(uid), trash: path.basename(trash) };
}

function tokenFor(uid) {
  const current = currentAccount();
  const file = current && current.uid === String(uid) ? canonicalAuthFile() : backupPath(uid);
  if (!safeStat(file)) throw new Error('未找到该账号的登录信息');
  const json = readJson(file);
  const auth = json && json.auth && typeof json.auth === 'object' ? json.auth : null;
  const token = authToken(auth);
  if (!token) {
    throw new Error(containsEnvelope(auth && auth.accessToken)
      ? '登录信息已加密，当前无法读取 token' + (keyError ? '：' + keyError : '，请退出 WorkBuddy 后重启本程序再试')
      : '登录信息中没有 accessToken');
  }
  const acct = accountFromJson(json) || {};
  return {
    token,
    account: {
      uid: String(acct.uid || uid),
      domain: typeof auth.domain === 'string' ? auth.domain : '',
      enterpriseId: String(acct.enterpriseId || ''),
      type: typeof acct.type === 'string' ? acct.type : '',
    },
  };
}

module.exports = {
  listAccounts: listBackups,
  currentAccount,
  backupCurrent,
  switchAccount,
  deleteAccount,
  ensureCurrentBackedUp,
  prepareNewLogin,
  canonicalAuthFile,
  tokenFor,
  decryptJson,
  containsEnvelope,
  text,
};
