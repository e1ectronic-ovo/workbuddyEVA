'use strict';

// 账号额度与签到结果的本地缓存：面板打开先显示上次结果，再后台刷新。
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');

const FILE = path.join(DATA_DIR, 'wb', 'account-state.json');
const MAX_UIDS = 50;

function today() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

function load() {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (_) {}
  return {
    credits: raw && typeof raw.credits === 'object' ? raw.credits : {},
    checkin: raw && typeof raw.checkin === 'object' ? raw.checkin : {},
  };
}

function trim(bucket) {
  const keys = Object.keys(bucket);
  if (keys.length <= MAX_UIDS) return bucket;
  keys.sort((a, b) => (Number(bucket[b] && bucket[b].at) || 0) - (Number(bucket[a] && bucket[a].at) || 0));
  const next = {};
  for (const key of keys.slice(0, MAX_UIDS)) next[key] = bucket[key];
  return next;
}

function persist(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const temp = FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(temp, FILE);
}

function putCredits(uid, info) {
  const id = String(uid || '');
  if (!id) return;
  const state = load();
  state.credits[id] = {
    at: Date.now(),
    ok: !!info.ok,
    credits: Number.isFinite(Number(info.credits)) ? Number(info.credits) : null,
    unlimited: !!info.unlimited,
    todayUsage: Number.isFinite(Number(info.todayUsage)) ? Number(info.todayUsage) : null,
    expired: !!info.expired,
    error: String(info.error || ''),
  };
  state.credits = trim(state.credits);
  persist(state);
}

function putCheckin(uid, result) {
  const id = String(uid || '');
  if (!id) return;
  const state = load();
  state.checkin[id] = {
    at: Date.now(),
    date: today(),
    ok: !!result.ok,
    already: !!result.already,
    inactive: !!result.inactive,
    code: Number.isFinite(Number(result.code)) ? Number(result.code) : null,
    message: String(result.message || ''),
  };
  state.checkin = trim(state.checkin);
  persist(state);
}

function publicState() {
  const state = load();
  const checkin = {};
  const date = today();
  for (const [uid, row] of Object.entries(state.checkin)) {
    checkin[uid] = Object.assign({}, row, { today: row && row.date === date });
  }
  return { credits: state.credits, checkin, date };
}

module.exports = { load, putCredits, putCheckin, publicState, today, FILE };
