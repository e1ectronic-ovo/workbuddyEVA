'use strict';

const runtime = require('./renderer-runtime');
const SOURCE = process.pkg ? require('./runtime-source') : runtime.toString();
const VERSION = 24;

function stateLiteral(state) {
  return JSON.stringify(state);
}

// 首次注入：定义 window.__wbwe 运行时并立即应用
function buildInit(state) {
  return '(' + SOURCE + ')(' + stateLiteral(state) + ');';
}

// 复用时只更新状态，避免重建 video 导致重播
function buildApply(state) {
  return '(() => { if (window.__wbwe && window.__wbwe.apply) { window.__wbwe.apply(' + stateLiteral(state) + '); return "updated"; } return "missing"; })()';
}

// 运行时版本探针：服务升级后需要重新注入，否则旧运行时不认识新字段
function buildVersionProbe() {
  return '!!(window.__wbwe && window.__wbwe.version === ' + VERSION + ')';
}

function buildProbe(id) {
  return '!!(window.__wbwe && window.__wbwe.version === ' + VERSION + ' && window.__wbwe.id === ' + JSON.stringify(id) + ')';
}

const buildDispose = '(() => { try { window.__wbwe ? window.__wbwe.dispose() : (window.__wbweDispose && window.__wbweDispose()); } catch (e) {} return true; })()';

module.exports = { buildInit, buildApply, buildProbe, buildVersionProbe, buildDispose, VERSION };
