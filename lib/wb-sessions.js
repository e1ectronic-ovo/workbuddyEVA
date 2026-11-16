'use strict';

// WorkBuddy 会话管理：读取 workbuddy.db，导出/重命名/软删除/恢复。
// 数据库由 WorkBuddy 自带的 Electron Node（含 node:sqlite）读取，避免额外原生依赖。
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DATA_DIR, APP_ID } = require('./paths');
const { profile } = require('./wb-paths');
const { helperPath } = require('./helper-path');

const BACKUP_DIR = path.join(DATA_DIR, 'wb', 'backups');
const INDEX_DIR = path.join(DATA_DIR, 'wb', 'sessions');
const INDEX_FILE = path.join(INDEX_DIR, 'index.json');
let cachedExe = '';

function nodeMajor() {
  return parseInt(String(process.versions.node || '0').split('.')[0], 10) || 0;
}

function runtime() {
  if (!process.pkg && nodeMajor() >= 22) {
    return { command: process.execPath, env: {} };
  }
  if (!cachedExe) cachedExe = require('../app/workbuddy').findExecutable();
  if (!cachedExe) {
    throw new Error('当前运行环境不支持 SQLite，且没有找到 WorkBuddy.exe；请安装 WorkBuddy');
  }
  return { command: cachedExe, env: { ELECTRON_RUN_AS_NODE: '1' } };
}

function query(request) {
  const dbPath = profile().sessionDb;
  if (!fs.existsSync(dbPath)) throw new Error('没有找到 WorkBuddy 会话库: ' + dbPath);
  let target;
  try { target = runtime(); } catch (error) { return Promise.reject(error); }
  return new Promise((resolve, reject) => {
    const child = spawn(target.command, ['--no-warnings', helperPath('wb-sqlite-helper.js')], {
      env: Object.assign({}, process.env, target.env, { WBWE_SESSION_DB: dbPath }),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    let err = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      reject(new Error('读取会话库超时'));
    }, 20000);
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.once('error', (error) => finish(new Error('无法启动会话数据库进程: ' + error.message)));
    child.once('close', (code) => {
      if (code !== 0) return finish(new Error('会话数据库进程退出(' + code + '): ' + (err || out).trim().slice(0, 300)));
      let data;
      try { data = JSON.parse(out); } catch (_) { return finish(new Error('会话数据库返回格式异常')); }
      if (!data.ok) return finish(new Error(data.error || '会话数据库操作失败'));
      finish(null, data.result);
    });
    child.stdin.end(JSON.stringify(request), 'utf8');
  });
}

function backupDb() {
  const dbPath = profile().sessionDb;
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const suffix of ['', '-wal', '-shm']) {
      const source = dbPath + suffix;
      if (!fs.existsSync(source)) continue;
      fs.copyFileSync(source, path.join(BACKUP_DIR, stamp + '-workbuddy.db' + suffix));
    }
    const files = fs.readdirSync(BACKUP_DIR).filter((name) => name.endsWith('.db'))
      .map((name) => ({ name, at: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at);
    for (const old of files.slice(20)) fs.unlinkSync(path.join(BACKUP_DIR, old.name));
  } catch (_) {}
}

function readIndex() {
  try {
    const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    return {
      updatedAt: Number(data.updatedAt) || 0,
      rows: Array.isArray(data.rows) ? data.rows : [],
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
    };
  } catch (_) {
    return { updatedAt: 0, rows: [], accounts: [] };
  }
}

function writeIndex(rows, accounts) {
  try {
    fs.mkdirSync(INDEX_DIR, { recursive: true });
    const temp = INDEX_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify({
      updatedAt: Date.now(),
      rows: rows.slice(0, 2000),
      accounts,
    }));
    fs.renameSync(temp, INDEX_FILE);
  } catch (_) {}
}

// 每次成功读取都把会话元数据留在自有数据目录；WorkBuddy 库暂时读不到时仍可浏览与导出。
function mergeIndex(rows, accounts) {
  if (!Array.isArray(rows) || !rows.length) return;
  const current = readIndex();
  const merged = new Map();
  for (const row of current.rows) {
    if (row && row.id != null) merged.set(String(row.id), row);
  }
  for (const row of rows) {
    if (!row || row.id == null) continue;
    const id = String(row.id);
    const old = merged.get(id);
    const stamp = Number(row.last_activity_at || row.updated_at || row.created_at) || 0;
    const oldStamp = old ? (Number(old.last_activity_at || old.updated_at || old.created_at) || 0) : -1;
    if (!old || stamp >= oldStamp) merged.set(id, row);
  }
  const all = [...merged.values()]
    .sort((a, b) => (Number(b.last_activity_at || b.updated_at || b.created_at) || 0)
      - (Number(a.last_activity_at || a.updated_at || a.created_at) || 0));
  writeIndex(all, Array.isArray(accounts) && accounts.length ? accounts : current.accounts);
}

function cachedList(options) {
  const index = readIndex();
  const account = options.account || '';
  const q = String(options.q || '').toLowerCase();
  let rows = index.rows.filter((row) => (options.deleted ? true : row.deleted_at == null));
  if (account) rows = rows.filter((row) => String(row.user_id || '') === account);
  if (q) {
    rows = rows.filter((row) => [row.title, row.custom_title, row.cwd]
      .some((value) => String(value || '').toLowerCase().includes(q)));
  }
  rows = rows.slice(0, Math.max(1, Math.min(500, Number(options.limit) || 200)));
  const counts = new Map();
  for (const row of index.rows) {
    if (row.deleted_at != null) continue;
    const uid = String(row.user_id || '');
    if (uid) counts.set(uid, (counts.get(uid) || 0) + 1);
  }
  return {
    rows,
    accounts: [...counts].map(([uid, count]) => ({ uid, count })),
    cached: true,
    cachedAt: index.updatedAt,
  };
}

async function list(options = {}) {
  try {
    const data = await query({
      op: 'list',
      account: options.account || '',
      q: options.q || '',
      deleted: !!options.deleted,
      limit: options.limit || 200,
    });
    mergeIndex(data.rows, data.accounts);
    return Object.assign({ cached: false }, data);
  } catch (error) {
    const fallback = cachedList(options);
    if (!fallback.rows.length && !fallback.cachedAt) throw error;
    fallback.error = error.message;
    return fallback;
  }
}

async function rename(id, title) {
  backupDb();
  return query({ op: 'rename', id: String(id || ''), title: String(title || '') });
}

async function remove(ids) {
  backupDb();
  return query({ op: 'softDelete', ids });
}

async function restore(ids) {
  backupDb();
  return query({ op: 'restore', ids });
}

async function activeCount() {
  try {
    const data = await query({ op: 'active' });
    return data.count || 0;
  } catch (_) {
    return 0;
  }
}

function projectsRoot() {
  return path.join(profile().dataRoot, 'projects');
}

function findSessionFiles(id) {
  const found = [];
  const root = projectsRoot();
  let workspaces = [];
  try { workspaces = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { return found; }
  for (const entry of workspaces) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, id + '.jsonl');
    if (fs.existsSync(file)) found.push(file);
  }
  const artifacts = path.join(profile().dataRoot, 'artifact-index', id + '.json');
  if (fs.existsSync(artifacts)) found.push(artifacts);
  return found;
}

function parseTranscript(file) {
  const stat = fs.statSync(file);
  if (stat.size > 64 * 1024 * 1024) {
    return { path: file, size: stat.size, skipped: '文件超过 64 MB，未内联' };
  }
  const text = fs.readFileSync(file, 'utf8');
  if (!/\.jsonl$/i.test(file)) {
    try { return { path: file, size: stat.size, data: JSON.parse(text) }; }
    catch (_) { return { path: file, size: stat.size, text }; }
  }
  const lines = [];
  let bad = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { lines.push(JSON.parse(trimmed)); } catch (_) { bad += 1; }
  }
  return { path: file, size: stat.size, lines, unparsed: bad };
}

async function exportSession(id) {
  const data = await query({ op: 'get', id });
  if (!data.row) throw new Error('会话不存在');
  const bundle = {
    app: APP_ID,
    exportedAt: new Date().toISOString(),
    session: data.row,
    usage: data.usage,
    transcripts: findSessionFiles(String(data.row.id)).map(parseTranscript),
  };
  const safe = String(data.row.custom_title || data.row.title || data.row.id)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 60) || 'session';
  return { name: safe + '-' + String(data.row.id).slice(0, 8) + '.json', body: JSON.stringify(bundle, null, 2) };
}

async function hardRemove(ids) {
  backupDb();
  const data = await query({ op: 'hardDelete', ids });
  let files = 0;
  for (const id of ids) {
    for (const file of findSessionFiles(String(id))) {
      try { fs.unlinkSync(file); files += 1; } catch (_) {}
    }
  }
  return { changes: data.changes, files };
}

module.exports = { list, rename, remove, restore, activeCount, exportSession, hardRemove, findSessionFiles };
