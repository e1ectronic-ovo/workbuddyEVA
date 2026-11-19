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

// 会话用量汇总：积分来自 session_usage.credit_json，Token 从转录里每条模型回复累加。
// 页面会周期性刷新，这里按文件大小/修改时间缓存解析结果，避免反复扫大文件。
const tokenCache = new Map();
const usageCache = new Map();

function readTokenFile(file, seen) {
  let stat;
  try { stat = fs.statSync(file); } catch (_) { return null; }
  if (stat.size > 64 * 1024 * 1024) return null;
  const cached = tokenCache.get(file);
  if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) return cached.value;
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (_) { return null; }
  const value = { input: 0, output: 0, total: 0, requests: 0, credits: 0, models: new Map() };
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    const provider = (row && row.providerData) || {};
    const usage = provider.usage || (row && row.message && row.message.usage);
    if (!usage) continue;
    const id = String(provider.messageId || row.messageId || row.id || '');
    if (id && seen.has(id)) continue;
    const total = Number(usage.total_tokens != null ? usage.total_tokens : usage.totalTokens) || 0;
    if (!total) continue;
    if (id) seen.add(id);
    const input = Number(usage.input_tokens != null ? usage.input_tokens : usage.inputTokens) || 0;
    const output = Number(usage.output_tokens != null ? usage.output_tokens : usage.outputTokens) || 0;
    const raw = provider.rawUsage || {};
    const credit = Number(raw.credit != null ? raw.credit : raw.credits);
    const credits = Number.isFinite(credit) ? credit : 0;
    value.input += input;
    value.output += output;
    value.total += total;
    value.requests += 1;
    value.credits += credits;
    // 按模型聚合，供面板还原 Qoder 风格的用量明细表。
    const key = String(provider.requestModelId || provider.model || row.model || 'unknown').toLowerCase();
    const name = String(provider.requestModelName || provider.modelName || provider.model || row.model || key);
    let model = value.models.get(key);
    if (!model) {
      model = { id: key, name, calls: 0, input: 0, output: 0, tokens: 0, credits: 0 };
      value.models.set(key, model);
    }
    model.calls += 1;
    model.input += input;
    model.output += output;
    model.tokens += total;
    model.credits += credits;
  }
  tokenCache.set(file, { mtime: stat.mtimeMs, size: stat.size, value });
  if (tokenCache.size > 40) tokenCache.delete(tokenCache.keys().next().value);
  return value;
}

function tokenTotals(id) {
  const seen = new Set();
  const sum = { input: 0, output: 0, total: 0, requests: 0, credits: 0, models: new Map() };
  let found = false;
  for (const file of findSessionFiles(String(id))) {
    if (!/\.jsonl$/i.test(file)) continue;
    const part = readTokenFile(file, seen);
    if (!part) continue;
    found = true;
    sum.input += part.input;
    sum.output += part.output;
    sum.total += part.total;
    sum.requests += part.requests;
    sum.credits += part.credits;
    for (const [key, model] of part.models) {
      let merged = sum.models.get(key);
      if (!merged) {
        merged = { id: key, name: model.name, calls: 0, input: 0, output: 0, tokens: 0, credits: 0 };
        sum.models.set(key, merged);
      }
      merged.calls += model.calls;
      merged.input += model.input;
      merged.output += model.output;
      merged.tokens += model.tokens;
      merged.credits += model.credits;
    }
  }
  return found && sum.requests ? sum : null;
}

// 转录里的 rawUsage.credit 偶有缺失：用会话积分总额按 Token 占比补齐每个模型的积分。
function allocateCredits(models, total) {
  const sum = models.reduce((acc, model) => acc + model.credits, 0);
  if (total <= 0) return;
  if (sum <= 0) {
    const tokens = models.reduce((acc, model) => acc + model.tokens, 0);
    if (!tokens) return;
    for (const model of models) model.credits = Math.round(total * model.tokens / tokens * 100) / 100;
    return;
  }
  const gap = total - sum;
  if (Math.abs(gap) < 0.01) return;
  const tokens = models.reduce((acc, model) => acc + model.tokens, 0);
  if (tokens <= 0) return;
  for (const model of models) {
    model.credits = Math.round((model.credits + gap * model.tokens / tokens) * 100) / 100;
  }
}

function creditTotals(usage) {
  let credits = 0;
  let turns = 0;
  try {
    const map = JSON.parse((usage && usage.credit_json) || '{}');
    for (const value of Object.values(map || {})) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      credits += n;
      turns += 1;
    }
  } catch (_) {}
  return { credits: Math.round(credits * 100) / 100, turns };
}

async function usageSummary(id) {
  const key = String(id || '');
  const cached = usageCache.get(key);
  if (cached && Date.now() - cached.at < 8000) return cached.value;
  const data = await query({ op: 'get', id: key });
  if (!data.row) throw new Error('会话不存在');
  const credit = creditTotals(data.usage);
  const tokens = tokenTotals(key);
  let models = [];
  if (tokens) {
    models = [...tokens.models.values()].sort((a, b) => b.tokens - a.tokens);
    allocateCredits(models, credit.credits);
    for (const model of models) model.credits = Math.round(model.credits * 100) / 100;
    if (!credit.credits) credit.credits = Math.round(models.reduce((acc, m) => acc + m.credits, 0) * 100) / 100;
  }
  const value = {
    id: key,
    title: data.row.custom_title || data.row.title || '',
    credits: credit.credits,
    turns: credit.turns,
    tokens: tokens
      ? { input: tokens.input, output: tokens.output, total: tokens.total, requests: tokens.requests }
      : null,
    models,
    used: Number(data.usage && data.usage.used) || 0,
    size: Number(data.usage && data.usage.size) || 0,
    updatedAt: Number(data.usage && data.usage.updated_at) || 0,
  };
  usageCache.set(key, { at: Date.now(), value });
  if (usageCache.size > 60) usageCache.delete(usageCache.keys().next().value);
  return value;
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

// ---- 会话同步 / 导入：复用 db 行的复制，再搬运消息文件与附件 ----

function projectRootDir() {
  return path.join(profile().dataRoot, 'projects');
}

function folderName(cwd) {
  const text = String(cwd || '').trim();
  if (!text) return '';
  return text.replace(/^([a-zA-Z]):/, (match, drive) => drive.toLowerCase() + '-')
    .replace(/[\\/:]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2, 8) + '.tmp';
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, file);
}

// 只重写记录外层的 sessionId，避免工具参数、消息正文里的同名字符串被误改。
function rebindTranscript(text, aliases, id) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { out.push(line); continue; }
    let record;
    try { record = JSON.parse(line); } catch (_) { throw new Error('会话消息文件未写完或已损坏'); }
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.type !== 'string') {
      throw new Error('会话消息格式不受支持');
    }
    if (record.sessionId !== id && aliases.includes(record.sessionId)) {
      record.sessionId = id;
      out.push(JSON.stringify(record));
    } else {
      out.push(line);
    }
  }
  return out.join(eol);
}

function rebindArtifact(data, aliases, id) {
  const artifacts = Array.isArray(data) ? data : (data && data.artifacts);
  if (Array.isArray(artifacts)) {
    for (const artifact of artifacts) {
      if (artifact && artifact._meta && aliases.includes(artifact._meta.ownerConversationId)) {
        artifact._meta.ownerConversationId = id;
      }
    }
  }
  return data;
}

function removeQuiet(target) {
  try { fs.rmSync(target, { recursive: true, force: true }); } catch (_) {}
}

function attachmentDir(transcriptPath, sessionId) {
  return path.join(path.dirname(transcriptPath), sessionId);
}

// 把源会话的消息文件、附件目录、产物索引搬到新 id 名下，返回写入的文件清单。
function copySessionFiles(sourceId, targetId, cwd) {
  const files = findSessionFiles(String(sourceId));
  const transcripts = files.filter((file) => /\.jsonl$/i.test(file));
  const artifacts = path.join(profile().dataRoot, 'artifact-index', String(sourceId) + '.json');
  const aliases = [String(sourceId), String(targetId)];
  const written = [];
  try {
    if (!transcripts.length) {
      // 没有消息文件时也建一份空的占位目录，保证列表里能正常打开会话。
      const folder = folderName(cwd) || 'imported';
      const placeholder = path.join(projectRootDir(), folder, String(targetId) + '.jsonl');
      writeAtomic(placeholder, '');
      written.push(placeholder);
    }
    for (const file of transcripts) {
      const target = path.join(path.dirname(file), String(targetId) + '.jsonl');
      writeAtomic(target, rebindTranscript(fs.readFileSync(file, 'utf8'), aliases, targetId));
      written.push(target);
      const sourceDir = attachmentDir(file, String(sourceId));
      if (fs.existsSync(sourceDir)) {
        const targetDir = attachmentDir(file, String(targetId));
        fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
        written.push(targetDir);
      }
    }
    if (fs.existsSync(artifacts)) {
      const target = path.join(profile().dataRoot, 'artifact-index', String(targetId) + '.json');
      const data = rebindArtifact(JSON.parse(fs.readFileSync(artifacts, 'utf8')), aliases, targetId);
      writeAtomic(target, JSON.stringify(data));
      written.push(target);
    }
  } catch (error) {
    for (const target of written) removeQuiet(target);
    throw error;
  }
  return written;
}

async function syncSessions({ from, to, ids }) {
  const source = String(from || '').trim();
  const target = String(to || '').trim();
  const list = Array.isArray(ids) ? ids.filter(Boolean).map(String) : [];
  if (!target) throw new Error('请选择目标账号');
  if (!source && !list.length) throw new Error('请选择要同步的会话');
  if (source && source === target) throw new Error('源账号和目标账号相同');
  backupDb();
  const data = await query({ op: 'copy', from: source, to: target, ids: list, limit: list.length ? list.length : 500 });
  const copied = [];
  const errors = [];
  for (const item of data.copies || []) {
    try {
      copySessionFiles(item.sourceId, item.id, (item.row && item.row.cwd) || '');
      copied.push({ id: item.id, sourceId: item.sourceId, title: (item.row && (item.row.custom_title || item.row.title)) || '' });
    } catch (error) {
      try { await query({ op: 'removeRow', id: item.id }); } catch (_) {}
      errors.push({ id: item.sourceId, error: error.message });
    }
  }
  return { copied, skipped: data.skipped || [], errors };
}

function importDir(record, transcriptPath) {
  const base = projectRootDir();
  const from = transcriptPath ? path.dirname(String(transcriptPath)) : '';
  if (from) {
    const relative = path.relative(base, from);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      && relative.split(/[\\/]/).filter(Boolean).length === 1) {
      return from;
    }
  }
  const folder = folderName(record.cwd) || 'imported';
  return path.join(base, folder);
}

async function importSessions(bundles, uid) {
  const target = String(uid || '').trim();
  if (!target) throw new Error('请选择目标账号');
  if (!Array.isArray(bundles) || !bundles.length) throw new Error('没有可导入的会话');
  backupDb();
  const imported = [];
  const duplicates = [];
  const errors = [];
  for (const bundle of bundles.slice(0, 200)) {
    const record = bundle && bundle.session;
    if (!record || typeof record !== 'object' || !record.id) {
      errors.push({ error: '文件里没有会话记录' });
      continue;
    }
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(String(record.id))) {
      errors.push({ id: String(record.id), error: '会话 ID 格式无效' });
      continue;
    }
    if (/working|planning/i.test(String(record.status || ''))) {
      errors.push({ id: record.id, error: '会话正在运行，未导入' });
      continue;
    }
    let inserted;
    try {
      inserted = await query({ op: 'insert', user_id: target, row: record, usage: bundle.usage || null });
    } catch (error) {
      errors.push({ id: record.id, error: error.message });
      continue;
    }
    if (inserted.duplicate) {
      duplicates.push({ id: record.id, targetId: inserted.id });
      continue;
    }
    const written = [];
    try {
      const transcripts = Array.isArray(bundle.transcripts) ? bundle.transcripts : [];
      const aliases = [String(record.id), String(inserted.id)];
      for (const item of transcripts) {
        if (!item) continue;
        if (Array.isArray(item.lines)) {
          const dir = importDir(record, item.path);
          const text = item.lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
          const file = path.join(dir, String(inserted.id) + '.jsonl');
          writeAtomic(file, rebindTranscript(text, aliases, inserted.id));
          written.push(file);
          if (item.path) {
            const sourceDir = attachmentDir(item.path, String(record.id));
            if (fs.existsSync(sourceDir)) {
              const dest = attachmentDir(file, String(inserted.id));
              fs.cpSync(sourceDir, dest, { recursive: true, force: true });
              written.push(dest);
            }
          }
          continue;
        }
        if (item.data && typeof item.data === 'object') {
          const file = path.join(profile().dataRoot, 'artifact-index', String(inserted.id) + '.json');
          writeAtomic(file, JSON.stringify(rebindArtifact(item.data, aliases, inserted.id)));
          written.push(file);
        }
      }
      imported.push({
        id: inserted.id,
        sourceId: record.id,
        title: record.custom_title || record.title || '',
      });
    } catch (error) {
      for (const file of written) removeQuiet(file);
      try { await query({ op: 'removeRow', id: inserted.id }); } catch (_) {}
      errors.push({ id: record.id, error: error.message });
    }
  }
  return { imported, duplicates, errors };
}

module.exports = {
  list, rename, remove, restore, activeCount, exportSession, hardRemove,
  findSessionFiles, usageSummary, syncSessions, importSessions,
};
