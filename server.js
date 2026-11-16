'use strict';

// workbuddyEVA
// 通过本机 CDP 把 Wallpaper Engine 的 Web / 视频 / Scene / 图片壁纸铺进 WorkBuddy，
// 控制面板直接注入 WorkBuddy 页面，不打开浏览器。启动器与注入逻辑在 app/ 中。

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const store = require('./lib/store');
const weScanner = require('./lib/we-scan');
const cdp = require('./lib/cdp');
const inject = require('./lib/inject');
const customStore = require('./lib/custom');
const paths = require('./lib/paths');
const dataMigration = require('./lib/data-migration');
const wbAuth = require('./lib/wb-auth');
const wbBilling = require('./lib/wb-billing');
const wbAccountState = require('./lib/wb-account-state');
const wbModels = require('./lib/wb-models');
const wbSessions = require('./lib/wb-sessions');
const wbEnhance = require('./lib/wb-enhance');
const wbPower = require('./lib/wb-power');

const PUBLIC_DIR = path.join(__dirname, 'public');
const SCENE_LIVE_DIR = path.join(__dirname, 'scene-live');
const WEBWALLGL_DIR = path.join(__dirname, 'node_modules', 'webwallgl');
const TOKEN = crypto.randomBytes(16).toString('hex');
const STARTED_AT = Date.now();
let accountLoginBusy = false;
function isOwnApp(id) {
  return !id || id === paths.APP_ID || paths.LEGACY_APP_IDS.includes(id);
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.pkg': 'application/octet-stream', '.tex': 'application/octet-stream',
  '.mdl': 'application/octet-stream', '.obj': 'text/plain; charset=utf-8', '.gltf': 'model/gltf+json',
  '.glb': 'model/gltf-binary', '.fbx': 'application/octet-stream', '.dae': 'model/vnd.collada+xml',
  '.stl': 'application/octet-stream', '.ply': 'application/octet-stream', '.3ds': 'application/octet-stream',
};

let state = store.load();
let projects = [];
let scannedAt = 0;
let base = '';
let lastStatus = { connected: false };
let lastStatusAt = 0;

// 壁纸库自动同步：工坊订阅/下载新壁纸后，轮询发现并推给面板与宿主工具条
let libraryVersion = 1;
let knownIds = new Set();
let newProjects = [];
let notice = '';
let noticeAt = 0;
let syncing = false;
let servicesStarted = false;

const SHIM = [
  '(function(){',
  '  if (window.__wbweShim) return; window.__wbweShim = true;',
  '  var noop = function(){};',
  '  var names = ["wallpaperRegisterAudioListener","wallpaperRegisterMediaStatusListener","wallpaperRegisterMediaPropertiesListener","wallpaperRegisterMediaThumbnailListener","wallpaperRegisterMediaPlaybackListener","wallpaperRegisterMediaTimelineListener","wallpaperRequestCustomPause"];',
  '  for (var i = 0; i < names.length; i++) if (!window[names[i]]) window[names[i]] = noop;',
  '  window.wallpaperPropertyListener = window.wallpaperPropertyListener || {};',
  '  if (typeof window.wallpaperPropertyListener.applyUserProperties !== "function") window.wallpaperPropertyListener.applyUserProperties = noop;',
  '  if (typeof window.wallpaperPropertyListener.applyGeneralProperties !== "function") window.wallpaperPropertyListener.applyGeneralProperties = noop;',
  '  document.documentElement.style.background = "transparent";',
  '  document.addEventListener("DOMContentLoaded", function(){ if (document.body) document.body.style.background = "transparent"; });',
  // 宿主是 file:// 页面，壁纸 iframe 收不到真实鼠标事件：由父页面把指针转发进来
  '  var down = false;',
  '  function fire(type, x, y, buttons) {',
  '    var t = document.elementFromPoint(x, y);',
  '    if (!t) return;',
  '    t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, buttons: buttons, button: 0 }));',
  '  }',
  '  window.addEventListener("message", function (e) {',
  '    var d = e.data;',
  '    if (!d || d.__wbwe !== 1 || d.method !== "pointer") return;',
  '    var x = (Number(d.u) || 0) * window.innerWidth;',
  '    var y = (Number(d.v) || 0) * window.innerHeight;',
  '    var buttons = Number(d.buttons) || 0;',
  '    if (buttons && !down) { down = true; fire("mousedown", x, y, buttons); }',
  '    if (!buttons && down) { down = false; fire("mouseup", x, y, 0); }',
  '    fire("mousemove", x, y, buttons);',
  '  });',
  '})();',
].join('\n');

// 用户自己上传的图片 / 视频，排在壁纸库最前面
function customProjects() {
  return customStore.list().map(c => {
    let sizeMb = 0;
    try { sizeMb = Math.round(fs.statSync(path.join(customStore.DATA_DIR, c.file)).size / 1048576); } catch (_) {}
    return {
      id: 'custom-' + c.id,
      dir: customStore.DATA_DIR,
      title: c.title,
      type: c.type,
      kind: c.type,
      live: false,
      file: c.file,
      hasPreview: c.type === 'image',
      tags: ['自定义'],
      sizeMb,
      workshop: false,
      custom: true,
      addedAt: c.addedAt || 0,
    };
  });
}

async function refresh(force) {
  if (!force && scannedAt && Date.now() - scannedAt < 8000) return projects;
  const found = await weScanner.scan(state);
  projects = customProjects().concat(found);
  scannedAt = Date.now();
  return projects;
}

function findProject(id) {
  return projects.find(p => p.id === id) || null;
}

function isImageFile(name) {
  return /\.(png|jpe?g|webp|gif)$/i.test(String(name || ''));
}

function desired(project) {
  const q = '?t=' + TOKEN;
  const id = encodeURIComponent(project.id);
  // Scene：WebWallGL 在 iframe 里实时渲染 scene.pkg / 松散工程；失败时前端回落到预览图
  const liveScene = project.kind === 'scene';
  const usePreview = !liveScene && project.kind === 'image' && !isImageFile(project.file);
  const fit = state.options.fit;
  // 地址只带 id + 资源基址：填充/帧率/音量走 postMessage 实时下发，改选项不重载场景
  const sceneUrl = base + '/scene-live/?id=' + id
    + '&base=' + encodeURIComponent('/scene-files/' + id + '/');
  return {
    id: project.id,
    title: project.title,
    kind: project.kind,
    mediaUrl: base + (usePreview || liveScene ? '/preview/' : '/media/') + id + q,
    webUrl: base + '/web/' + id + '/' + q,
    sceneUrl,
    mask: state.options.mask,
    blur: state.options.blur,
    fit,
    glass: state.options.glass,
    audio: state.options.audio,
    perf: state.options.perf,
    sceneFps: state.options.sceneFps,
    parallax: state.options.parallax !== false,
    transition: state.options.transition,
    videoRate: state.options.videoRate,
    apiBase: base,
    token: TOKEN,
    canNav: playable().length > 1,
    enhance: wbEnhance.load(),
    notice: notice && Date.now() - noticeAt < 60000 ? notice : '',
  };
}

function idlePayload() {
  return { id: '', title: '壁纸', apiBase: base, token: TOKEN, enhance: wbEnhance.load() };
}

async function applyIdle() {
  await cdp.evaluate(inject.buildDispose, { timeout: 5000 }).catch(() => {});
  await cdp.evaluate(inject.buildInit(idlePayload()), { timeout: 10000 });
}

// 没有选中壁纸时也注入宿主工具条，作为唯一的面板入口（Electron 窗口已移除）
async function ensureIdleBar() {
  if (state.selectedId) return;
  const present = await cdp.evaluate(
    '!!(window.__wbwe && window.__wbwe.version === ' + inject.VERSION + ' && document.getElementById("wbwe-bar"))',
    { timeout: 4000 },
  ).catch(() => false);
  if (!present) await cdp.evaluate(inject.buildInit(idlePayload()), { timeout: 10000 });
}

async function applyProject(project) {
  if (project.kind === 'image' && !isImageFile(project.file) && !project.hasPreview) {
    throw new Error('该壁纸既没有可播放的媒体文件，也没有预览图');
  }
  const payload = desired(project);
  const versionOk = await cdp.evaluate(inject.buildVersionProbe(), { timeout: 4000 }).catch(() => false);
  if (!versionOk) {
    // 旧运行时不会认识新字段（性能模式 / 工具条），先卸载再重新注入
    await cdp.evaluate(inject.buildDispose, { timeout: 4000 }).catch(() => {});
    await cdp.evaluate(inject.buildInit(payload), { timeout: 12000 });
  } else {
    const result = await cdp.evaluate(inject.buildApply(payload), { timeout: 6000 });
    if (result !== 'updated') await cdp.evaluate(inject.buildInit(payload), { timeout: 10000 });
  }
  state.selectedId = project.id;
  store.save(state);
  return payload;
}

async function pushOptions() {
  if (!state.selectedId) return;
  await refresh();
  const project = findProject(state.selectedId);
  if (project) await applyProject(project);
}

// 增强选项变化时即使没有选中壁纸也要下发，工具条与注入运行时保持同步
async function pushEnhance() {
  const project = state.selectedId ? findProject(state.selectedId) : null;
  const payload = project ? desired(project) : idlePayload();
  try {
    await cdp.evaluate(inject.buildApply(payload), { timeout: 5000 });
  } catch (_) {}
}

// 可切换的壁纸：排除隐藏项与没有预览图的 Scene 工程，避免上一张/下一张切到黑屏
function playable() {
  return projects.filter(p => !state.hidden.includes(p.id)
    && !(p.kind === 'image' && !isImageFile(p.file) && !p.hasPreview));
}

async function navProject(dir) {
  await refresh();
  const list = playable();
  if (!list.length) throw new Error('壁纸库为空，无法切换');
  const size = list.length;
  const idx = list.findIndex(p => p.id === state.selectedId);
  const delta = dir === 'prev' ? -1 : 1;
  const target = list[((idx < 0 ? (delta > 0 ? -1 : 0) : idx) + delta + size) % size];
  await applyProject(target);
  return target;
}

async function pollLibrary() {
  if (syncing) return;
  syncing = true;
  try {
    const prev = new Set(knownIds.size ? knownIds : projects.map(p => p.id));
    scannedAt = 0; // 强制重扫，project.json 有 mtime 缓存，开销很小
    await refresh(true);
    const fresh = projects.filter(p => !prev.has(p.id));
    knownIds = new Set(projects.map(p => p.id));
    if (!fresh.length) return;

    libraryVersion++;
    newProjects = fresh.concat(newProjects.filter(n => projects.some(p => p.id === n.id))).slice(0, 50);
    notice = fresh.length === 1
      ? '发现新壁纸：' + fresh[0].title
      : '发现 ' + fresh.length + ' 个新壁纸：' + fresh.slice(0, 2).map(p => p.title).join('、') + (fresh.length > 2 ? ' 等' : '');
    noticeAt = Date.now();
    console.log('[wbwe] ' + notice);

    if (state.selectedId && !projects.some(p => p.id === state.selectedId)) {
      console.log('[wbwe] 正在使用的壁纸已从工坊移除，清除壁纸层');
      state.selectedId = '';
      store.save(state);
      await applyIdle().catch(() => {});
      return;
    }
    // 把同步提示推到宿主工具条
    await pushOptions().catch(() => {});
  } finally {
    syncing = false;
  }
}

function startLibrarySync() {
  setInterval(() => { pollLibrary().catch(() => {}); }, 8000).unref();
}

// 自动轮播：按设定间隔在可见壁纸之间切换（可选随机），状态存 config.json
let rotationAt = Date.now();
let rotating = false;
async function rotateTick() {
  const rot = state.rotation;
  if (!rot.enabled || rotating) return;
  if (Date.now() - rotationAt < rot.minutes * 60000) return;
  rotating = true;
  try {
    await refresh();
    const list = playable();
    if (!list.length) return;
    let target;
    if (rot.shuffle) {
      const pool = list.filter(p => p.id !== state.selectedId);
      target = (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
    } else {
      const idx = list.findIndex(p => p.id === state.selectedId);
      target = list[(idx + 1 + list.length) % list.length];
    }
    await applyProject(target);
    rotationAt = Date.now();
    notice = '自动轮播：' + target.title;
    noticeAt = Date.now();
    await pushOptions().catch(() => {});
  } catch (_) {
  } finally {
    rotating = false;
  }
}
function startRotation() {
  setInterval(() => { rotateTick().catch(() => {}); }, 15000).unref();
}
function resetRotation() {
  rotationAt = Date.now();
}

function slim(p) {
  return {
    id: p.id,
    title: p.title,
    type: p.type,
    kind: p.kind,
    workshop: p.workshop,
    sizeMb: p.sizeMb,
    tags: p.tags,
    hasPreview: p.hasPreview,
    isNew: newProjects.some(n => n.id === p.id),
    live: p.type === 'scene' ? !!p.live : true,
    custom: !!p.custom,
    hidden: state.hidden.includes(p.id),
    preview: p.hasPreview ? '/preview/' + encodeURIComponent(p.id) + '?t=' + TOKEN : '',
    previewVideo: p.custom && p.type === 'video' ? '/media/' + encodeURIComponent(p.id) + '?t=' + TOKEN : '',
    note: p.type === 'scene'
      ? (p.live ? 'Scene 由 WebWallGL 实时渲染（WebGL）' : '该 Scene 工程没有可渲染的 scene.pkg / scene.json')
      : '',
  };
}

async function status(force) {
  if (!force && Date.now() - lastStatusAt < 3000) return lastStatus;
  lastStatus = await cdp.status();
  lastStatusAt = Date.now();
  return lastStatus;
}

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function text(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(new Error('请求格式无效')); }
    });
    req.on('error', reject);
  });
}

// 上传自定义壁纸：请求体直接是文件二进制，文件名放在 X-Filename 头里
function saveUpload(req, dest) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(dest);
    let size = 0;
    let failed = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > customStore.MAX_BYTES && !failed) {
        failed = true;
        req.destroy();
        out.destroy();
        reject(new Error('文件过大（上限 600MB）'));
      }
    });
    req.pipe(out);
    out.on('finish', () => { if (!failed) resolve(size); });
    out.on('error', err => { if (!failed) { failed = true; reject(err); } });
    req.on('error', err => { if (!failed) { failed = true; reject(err); } });
  });
}

function checkToken(url) {
  return url.searchParams.get('t') === TOKEN;
}

function insideRoot(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function sendFile(req, res, file, { mime, cache, allowRange } = {}) {
  let stat;
  try { stat = fs.statSync(file); } catch (_) { return json(res, 404, { error: '文件不存在' }); }
  if (stat.isDirectory()) return json(res, 404, { error: '不是文件' });
  const type = mime || MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Accept-Ranges': allowRange ? 'bytes' : 'none', 'Cache-Control': cache ? 'public, max-age=60' : 'no-store' };

  if (allowRange) {
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) {
      let start = range[1] ? Number(range[1]) : 0;
      let end = range[2] ? Number(range[2]) : stat.size - 1;
      if (start >= stat.size || end < start) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      end = Math.min(end, stat.size - 1);
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
  }
  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

function servePublic(req, res, url) {
  const name = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  if (!/^(index\.html|app\.js|style\.css|assets\/brand\/[a-z0-9-]+\.png)$/.test(name)) {
    return json(res, 404, { error: '未找到' });
  }
  sendFile(req, res, path.join(PUBLIC_DIR, name), { cache: false });
}

function serveMedia(req, res, url) {
  if (!checkToken(url)) return json(res, 403, { error: '无效的访问令牌' });
  const id = decodeURIComponent(url.pathname.split('/')[2] || '');
  const project = findProject(id);
  if (!project || !project.file) return json(res, 404, { error: '壁纸不存在' });
  const file = path.join(project.dir, project.file);
  if (!insideRoot(project.dir, file)) return json(res, 403, { error: '非法路径' });
  sendFile(req, res, file, { allowRange: true, mime: MIME[path.extname(file).toLowerCase()] });
}

function servePreview(req, res, url) {
  if (!checkToken(url)) return json(res, 404, { error: '未找到' });
  const id = decodeURIComponent(url.pathname.split('/')[2] || '');
  const project = findProject(id);
  if (!project) return json(res, 404, { error: '壁纸不存在' });
  // 自定义图片本身就可以当预览图
  if (project.custom && project.file) {
    const own = path.join(project.dir, project.file);
    if (insideRoot(project.dir, own) && fs.existsSync(own)) return sendFile(req, res, own, { cache: true });
  }
  const candidates = ['preview.jpg', 'preview.jpeg', 'preview.png', 'preview.gif', 'preview.webp'];
  const hit = candidates.map(n => path.join(project.dir, n)).find(p => fs.existsSync(p));
  if (!hit) return json(res, 404, { error: '没有预览图' });
  sendFile(req, res, hit, { cache: true });
}

function serveWeb(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // web, <id>, rest...
  const id = decodeURIComponent(parts[1] || '');
  const project = findProject(id);
  if (!project || project.type !== 'web') return json(res, 404, { error: '网页壁纸不存在' });
  const rest = parts.slice(2).join('/') || (project.file || 'index.html');
  let file = path.join(project.dir, rest);
  if (!insideRoot(project.dir, file)) return json(res, 403, { error: '非法路径' });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return json(res, 404, { error: '文件不存在' });

  if (path.extname(file).toLowerCase() === '.html') {
    let html;
    try { html = fs.readFileSync(file, 'utf8'); } catch (_) { return json(res, 500, { error: '读取失败' }); }
    const tag = `<script src="/shim.js?t=${TOKEN}"></script><style>html,body{margin:0;height:100%;background:transparent!important;overflow:hidden}</style>`;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + tag) : tag + html;
    return text(res, 200, html, 'text/html; charset=utf-8');
  }
  sendFile(req, res, file, { cache: true });
}

// WebWallGL 渲染页（iframe 内运行，避免和宿主 UI 抢事件）
function serveSceneLive(req, res, url) {
  const rel = decodeURIComponent(url.pathname.replace(/^\/scene-live\/?/, '')) || 'index.html';
  const file = path.join(SCENE_LIVE_DIR, rel);
  if (!insideRoot(SCENE_LIVE_DIR, file)) return json(res, 403, { error: '非法路径' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: '文件不存在' });
  sendFile(req, res, file, { cache: false });
}

// 渲染器本身（webwallgl.global.min.js 等）直接从 node_modules 提供
function serveSceneEngine(req, res, url) {
  const rel = decodeURIComponent(url.pathname.replace(/^\/scene-engine\//, '')) || 'webwallgl.global.min.js';
  const file = path.join(WEBWALLGL_DIR, rel);
  if (!insideRoot(WEBWALLGL_DIR, file)) return json(res, 403, { error: '非法路径' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return json(res, 404, { error: '文件不存在' });
  sendFile(req, res, file, { cache: true });
}

// Scene 工程文件：project.json / scene.pkg / 松散材质模型（支持 Range）
function serveSceneFiles(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // scene-files, <id>, rest...
  const id = decodeURIComponent(parts[1] || '');
  const project = findProject(id);
  if (!project || project.type !== 'scene') return json(res, 404, { error: 'Scene 壁纸不存在' });
  const rest = parts.slice(2).map(decodeURIComponent).join('/') || 'project.json';
  let file = path.join(project.dir, rest);
  if (!insideRoot(project.dir, file)) return json(res, 403, { error: '非法路径' });
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'project.json');
  if (!fs.existsSync(file)) return json(res, 404, { error: '文件不存在' });
  sendFile(req, res, file, { cache: true, allowRange: true });
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  // 供 Electron 外壳探测「端口上跑的是不是本程序」，用于复用已运行的实例
  if (req.method === 'GET' && p === '/api/health') {
    return json(res, 200, { app: paths.APP_ID, name: paths.APP_NAME, exe: paths.EXE_NAME, version: 4, projects: projects.length });
  }
  if (req.method === 'GET' && p === '/api/state') {
    await refresh();
    const st = await status();
    const gpu = st.connected ? await cdp.gpu() : { renderer: '', software: false };
    return json(res, 200, {
      connected: st.connected,
      cdp: { port: st.port, target: st.target || '', error: st.error || '' },
      gpu,
      projects: projects.map(slim),
      selectedId: state.selectedId,
      options: state.options,
      rotation: state.rotation,
      roots: state.extraRoots.slice(0, 8),
      hiddenCount: state.hidden.length,
      base,
      libraryVersion,
      newCount: projects.filter(x => newProjects.some(n => n.id === x.id)).length,
      newProjects: newProjects.filter(n => projects.some(x => x.id === n.id)),
      notice: notice && Date.now() - noticeAt < 60000 ? notice : '',
    });
  }
  if (req.method === 'GET' && p === '/api/nav') {
    if (!checkToken(url)) return json(res, 403, { error: '无效的访问令牌' });
    const dir = url.searchParams.get('dir') === 'prev' ? 'prev' : 'next';
    const project = await navProject(dir);
    return json(res, 200, { ok: true, selectedId: project.id, title: project.title });
  }
  // 面板里的「退出」：先回应，再走常驻进程的关闭流程（会撤掉注入层）
  if (req.method === 'POST' && p === '/api/quit') {
    json(res, 200, { ok: true });
    setTimeout(() => {
      // Windows 上 process.kill(自己, 'SIGTERM') 会直接终止进程、跳过清理；
      // 用 emit 走 daemon 注册的关闭流程，独立运行面板时才直接退出。
      if (process.listenerCount('SIGTERM')) process.emit('SIGTERM');
      else process.exit(0);
    }, 150);
    return;
  }
  // 独立运行：用户点按钮时重启 WorkBuddy 并开启 CDP
  if (req.method === 'POST' && p === '/api/relaunch') {
    const workbuddy = require('./app/workbuddy');
    const port = Number(process.env.WBWE_CDP_PORT) || 9222;
    try {
      const result = await workbuddy.ensureCdp({ port, restart: true, log: () => {} });
      workbuddy.rememberPort(result.port);
      cdp.reset();
      lastStatusAt = 0;
      return json(res, 200, { ok: true, port: result.port });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  }
  // ---- WorkBuddy 账号 ----
  if (req.method === 'GET' && p === '/api/wb/accounts') {
    try {
      // 登录新账号后第一次打开面板：自动把当前账号入库
      try { wbAuth.ensureCurrentBackedUp(); } catch (_) {}
      return json(res, 200, {
        ok: true,
        current: wbAuth.currentAccount(),
        accounts: wbAuth.listAccounts(),
        state: wbAccountState.publicState(),
      });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/refresh') {
    const body = await readBody(req);
    try {
      const current = wbAuth.currentAccount();
      const targets = [];
      const push = (uid) => {
        const id = String(uid || '').trim();
        if (id && !targets.includes(id)) targets.push(id);
      };
      if (Array.isArray(body.uids) && body.uids.length) body.uids.forEach(push);
      else {
        if (current) push(current.uid);
        for (const account of wbAuth.listAccounts()) push(account.uid);
      }
      const results = {};
      for (const uid of targets.slice(0, 5)) {
        try {
          const { token, account } = wbAuth.tokenFor(uid);
          const data = await wbBilling.credits(token, account);
          wbAccountState.putCredits(uid, Object.assign({ ok: true }, data));
          results[uid] = { ok: true, credits: data.credits, unlimited: !!data.unlimited, todayUsage: data.todayUsage };
        } catch (err) {
          wbAccountState.putCredits(uid, { ok: false, expired: !!err.expired, error: err.message });
          results[uid] = { ok: false, expired: !!err.expired, error: err.message };
        }
      }
      return json(res, 200, { ok: true, results, state: wbAccountState.publicState() });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/login') {
    if (accountLoginBusy) return json(res, 409, { ok: false, error: '正在登录流程中，请稍候' });
    accountLoginBusy = true;
    const log = (message) => console.log('[wbwe] ' + message);
    // 先回包再重启：面板随 WorkBuddy 一起关闭，不能让请求悬着
    setTimeout(() => {
      wbAuth.prepareNewLogin({ log }).catch((err) => {
        log('[login] 登录新账号失败: ' + err.message);
      }).finally(() => { accountLoginBusy = false; });
    }, 800);
    return json(res, 200, { ok: true, started: true });
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/backup') {
    try {
      return json(res, 200, { ok: true, account: wbAuth.backupCurrent() });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/switch') {
    const body = await readBody(req);
    try {
      const uid = String(body.uid || '').trim();
      if (!uid) return json(res, 400, { ok: false, error: '缺少账号 uid' });
      const account = wbAuth.switchAccount(uid);
      let reloaded = false;
      if (body.reload !== false) {
        try {
          await cdp.evaluate('location.reload()', { timeout: 2000 });
          reloaded = true;
        } catch (_) {}
        lastStatusAt = 0;
      }
      return json(res, 200, { ok: true, account, reloaded });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/delete') {
    const body = await readBody(req);
    try {
      const uid = String(body.uid || '').trim();
      if (!uid) return json(res, 400, { ok: false, error: '缺少账号 uid' });
      return json(res, 200, { ok: true, ...wbAuth.deleteAccount(uid) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/checkin') {
    const body = await readBody(req);
    try {
      const current = wbAuth.currentAccount();
      const uid = String(body.uid || (current && current.uid) || '').trim();
      if (!uid) return json(res, 400, { ok: false, error: '没有可签到的账号' });
      const { token, account } = wbAuth.tokenFor(uid);
      const result = await wbBilling.checkin(token, account);
      wbAccountState.putCheckin(uid, result);
      return json(res, result.expired ? 401 : 200, Object.assign({ ok: result.ok, uid }, result));
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/accounts/credits') {
    const body = await readBody(req);
    try {
      const current = wbAuth.currentAccount();
      const uid = String(body.uid || (current && current.uid) || '').trim();
      if (!uid) return json(res, 400, { ok: false, error: '没有可查询的账号' });
      const { token, account } = wbAuth.tokenFor(uid);
      const result = await wbBilling.credits(token, account);
      wbAccountState.putCredits(uid, Object.assign({ ok: true }, result));
      return json(res, 200, Object.assign({ ok: true, uid }, result));
    } catch (err) {
      return json(res, err.expired ? 401 : 500, { ok: false, expired: !!err.expired, error: err.message });
    }
  }
  // ---- WorkBuddy 自定义模型 ----
  if (req.method === 'GET' && p === '/api/wb/models') {
    try {
      return json(res, 200, { ok: true, models: wbModels.list(), file: wbModels.modelsFile() });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/models/save') {
    const body = await readBody(req);
    try {
      return json(res, 200, { ok: true, model: wbModels.save(body) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/models/delete') {
    const body = await readBody(req);
    try {
      return json(res, 200, { ok: true, ...wbModels.remove(String(body.id || '')) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/models/toggle') {
    const body = await readBody(req);
    try {
      return json(res, 200, { ok: true, model: wbModels.setEnabled(String(body.id || ''), !!body.enabled) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  // ---- WorkBuddy 会话 ----
  if (req.method === 'GET' && p === '/api/wb/sessions') {
    try {
      const data = await wbSessions.list({
        account: url.searchParams.get('account') || '',
        q: url.searchParams.get('q') || '',
        deleted: url.searchParams.get('deleted') === '1',
        limit: Number(url.searchParams.get('limit')) || 200,
      });
      const labels = {};
      try {
        const current = wbAuth.currentAccount();
        if (current && current.uid) labels[current.uid] = current.nickname || current.uid;
        for (const account of wbAuth.listAccounts()) {
          if (!labels[account.uid]) labels[account.uid] = account.nickname || account.uid;
        }
      } catch (_) {}
      return json(res, 200, {
        ok: true,
        rows: data.rows,
        accounts: data.accounts,
        labels,
        cached: !!data.cached,
        cachedAt: data.cachedAt || 0,
        warning: data.error || '',
        db: require('./lib/wb-paths').profile().sessionDb,
      });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/sessions/rename') {
    const body = await readBody(req);
    try {
      const result = await wbSessions.rename(String(body.id || ''), String(body.title || '').trim());
      if (!result.changes) return json(res, 404, { ok: false, error: '会话不存在或已删除' });
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/sessions/delete') {
    const body = await readBody(req);
    try {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return json(res, 400, { ok: false, error: '没有选择会话' });
      const result = body.hard
        ? await wbSessions.hardRemove(ids)
        : await wbSessions.remove(ids);
      return json(res, 200, { ok: true, ...result });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/sessions/restore') {
    const body = await readBody(req);
    try {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return json(res, 400, { ok: false, error: '没有选择会话' });
      return json(res, 200, { ok: true, ...(await wbSessions.restore(ids)) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'GET' && p === '/api/wb/sessions/export') {
    try {
      const bundle = await wbSessions.exportSession(String(url.searchParams.get('id') || ''));
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(bundle.name) + '"',
        'Cache-Control': 'no-store',
      });
      return res.end(bundle.body);
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/sessions/export') {
    const body = await readBody(req);
    try {
      const ids = Array.isArray(body.ids)
        ? body.ids.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 500)
        : [];
      if (!ids.length) return json(res, 400, { ok: false, error: '没有选择会话' });
      const sessions = [];
      const errors = [];
      for (const id of ids) {
        try {
          sessions.push(JSON.parse((await wbSessions.exportSession(id)).body));
        } catch (err) {
          errors.push({ id, error: err.message });
        }
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = 'sessions-' + stamp + '-' + sessions.length + '.json';
      const payload = JSON.stringify({
        app: paths.APP_ID,
        exportedAt: new Date().toISOString(),
        count: sessions.length,
        sessions,
        errors,
      }, null, 2);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Cache-Control': 'no-store',
      });
      return res.end(payload);
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  // ---- 关于 ----
  if (req.method === 'GET' && p === '/api/about') {
    let version = '';
    try { version = require('./package.json').version; } catch (_) {}
    return json(res, 200, {
      ok: true,
      app: paths.APP_ID,
      name: paths.APP_NAME,
      nameEn: paths.APP_NAME_EN,
      exe: paths.EXE_NAME,
      version,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      dataDir: paths.DATA_DIR,
      panel: base,
      startedAt: STARTED_AT,
    });
  }
  // ---- WorkBuddy 增强 ----
  if (req.method === 'GET' && p === '/api/wb/enhance') {
    try {
      return json(res, 200, { ok: true, enhance: wbEnhance.publicState() });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/enhance') {
    const body = await readBody(req);
    try {
      const enhance = wbEnhance.save(body);
      await pushEnhance();
      return json(res, 200, { ok: true, enhance });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  // ---- 电脑电源策略 ----
  if (req.method === 'GET' && p === '/api/wb/power') {
    return json(res, 200, { ok: true, power: wbPower.status() });
  }
  if (req.method === 'POST' && p === '/api/wb/power') {
    const body = await readBody(req);
    try {
      return json(res, 200, { ok: true, power: wbPower.apply(String(body.mode || 'allow'), !!body.displaySleep) });
    } catch (err) {
      return json(res, 500, { ok: false, error: err.message });
    }
  }
  if (req.method === 'POST' && p === '/api/wb/power/sleep') {
    return wbPower.sleepNow()
      ? json(res, 200, { ok: true })
      : json(res, 500, { ok: false, error: '立即休眠失败' });
  }
  if (req.method === 'GET' && p === '/api/projects') {
    await refresh(true);
    return json(res, 200, { projects: projects.map(slim) });
  }
  if (req.method === 'POST' && p === '/api/apply') {
    const body = await readBody(req);
    await refresh();
    const project = findProject(String(body.id || ''));
    if (!project) return json(res, 404, { error: '壁纸不存在或已从工坊移除' });
    await applyProject(project);
    newProjects = newProjects.filter(n => n.id !== project.id);
    return json(res, 200, { ok: true, selectedId: project.id });
  }
  if (req.method === 'POST' && p === '/api/options') {
    const body = await readBody(req);
    const next = store.load();
    const merged = { ...next.options };
    if (body.mask !== undefined) merged.mask = Math.min(0.9, Math.max(0, Number(body.mask) || 0));
    if (body.blur !== undefined) merged.blur = Math.min(40, Math.max(0, Number(body.blur) || 0));
    if (body.glass !== undefined) merged.glass = !!body.glass;
    if (body.perf !== undefined) merged.perf = !!body.perf;
    if (body.audio !== undefined) merged.audio = !!body.audio;
    if (['cover', 'contain', 'stretch'].includes(body.fit)) merged.fit = body.fit;
    if (body.sceneFps !== undefined) {
      const fps = Number(body.sceneFps);
      merged.sceneFps = [30, 60, 90, 120].includes(fps) ? fps : merged.sceneFps;
    }
    if (body.parallax !== undefined) merged.parallax = !!body.parallax;
    if (body.transition !== undefined) merged.transition = Math.min(1.5, Math.max(0, Number(body.transition) || 0));
    if (body.videoRate !== undefined) {
      const rate = Number(body.videoRate);
      if ([0.5, 0.75, 1, 1.25, 1.5, 2].includes(rate)) merged.videoRate = rate;
    }
    state.options = merged;
    store.save(state);
    await pushOptions().catch(() => {});
    return json(res, 200, { ok: true, options: state.options });
  }
  if (req.method === 'POST' && p === '/api/clear') {
    state.selectedId = '';
    store.save(state);
    await applyIdle().catch(() => {});
    return json(res, 200, { ok: true });
  }
  if (req.method === 'POST' && p === '/api/custom') {
    const name = decodeURIComponent(String(req.headers['x-filename'] || '')).trim();
    const ext = path.extname(name).toLowerCase();
    const type = customStore.typeOf(ext);
    if (!type) return json(res, 400, { error: '只支持图片（jpg/png/webp/gif）和视频（mp4/webm/mov/mkv）' });
    const id = crypto.randomBytes(6).toString('hex');
    const file = id + ext;
    fs.mkdirSync(customStore.DATA_DIR, { recursive: true });
    const dest = path.join(customStore.DATA_DIR, file);
    let size = 0;
    try {
      size = await saveUpload(req, dest);
    } catch (err) {
      try { fs.unlinkSync(dest); } catch (_) {}
      return json(res, 400, { error: err.message });
    }
    if (!size) {
      try { fs.unlinkSync(dest); } catch (_) {}
      return json(res, 400, { error: '文件为空' });
    }
    const title = (path.basename(name, ext).trim() || '自定义壁纸').slice(0, 80);
    customStore.add({ id, title, file, type, addedAt: Date.now(), size });
    await refresh(true);
    return json(res, 200, { ok: true, id: 'custom-' + id, projects: projects.map(slim) });
  }
  if (req.method === 'POST' && p === '/api/custom/delete') {
    const body = await readBody(req);
    const raw = String(body.id || '').replace(/^custom-/, '');
    const hit = customStore.remove(raw);
    if (!hit) return json(res, 404, { error: '自定义壁纸不存在' });
    state.hidden = state.hidden.filter(x => x !== 'custom-' + raw);
    const usingThis = state.selectedId === 'custom-' + raw;
    if (usingThis) state.selectedId = '';
    store.save(state);
    if (usingThis) await applyIdle().catch(() => {});
    await refresh(true);
    return json(res, 200, { ok: true, projects: projects.map(slim) });
  }
  if (req.method === 'POST' && p === '/api/roots') {
    const body = await readBody(req);
    const dir = String(body.dir || '').trim();
    if (!dir || !path.isAbsolute(dir)) return json(res, 400, { error: '请填写绝对路径' });
    let ok = false;
    try { ok = fs.statSync(dir).isDirectory(); } catch (_) {}
    if (!ok) return json(res, 400, { error: '目录不存在' });
    if (!state.extraRoots.includes(dir)) state.extraRoots.push(dir);
    store.save(state);
    await refresh(true);
    return json(res, 200, { ok: true, roots: state.extraRoots, projects: projects.map(slim) });
  }
  if (req.method === 'POST' && p === '/api/roots/remove') {
    const body = await readBody(req);
    const dir = String(body.dir || '').trim();
    state.extraRoots = state.extraRoots.filter(d => d !== dir);
    store.save(state);
    await refresh(true);
    return json(res, 200, { ok: true, roots: state.extraRoots, projects: projects.map(slim) });
  }
  // 隐藏 / 恢复壁纸：只影响壁纸库与轮播，不改变正在显示的壁纸
  if (req.method === 'POST' && p === '/api/hide') {
    const body = await readBody(req);
    const id = String(body.id || '');
    if (!id) return json(res, 400, { error: '缺少壁纸 id' });
    const hidden = state.hidden.filter(x => x !== id);
    if (body.hidden !== false) hidden.push(id);
    state.hidden = hidden;
    store.save(state);
    await refresh();
    return json(res, 200, { ok: true, hidden: body.hidden !== false, hiddenCount: hidden.length });
  }
  if (req.method === 'POST' && p === '/api/rotation') {
    const body = await readBody(req);
    const rot = { ...state.rotation };
    if (body.enabled !== undefined) rot.enabled = !!body.enabled;
    if (body.minutes !== undefined) {
      const m = Number(body.minutes);
      if ([5, 10, 15, 30, 60, 120].includes(m)) rot.minutes = m;
    }
    if (body.shuffle !== undefined) rot.shuffle = !!body.shuffle;
    state.rotation = rot;
    store.save(state);
    resetRotation();
    return json(res, 200, { ok: true, rotation: rot });
  }
  // 预设：把外观 / 轮播 / 壁纸目录导出成 JSON，换机器时一键还原
  if (req.method === 'GET' && p === '/api/preset') {
    return json(res, 200, {
      app: paths.APP_ID,
      version: 1,
      exportedAt: new Date().toISOString(),
      options: state.options,
      rotation: state.rotation,
      extraRoots: state.extraRoots,
      hidden: state.hidden,
    });
  }
  if (req.method === 'POST' && p === '/api/preset') {
    const body = await readBody(req);
    const src = body.preset && typeof body.preset === 'object' ? body.preset : body;
    if (src.app && !isOwnApp(src.app)) {
      return json(res, 400, { error: '不是本程序导出的预设文件' });
    }
    const roots = Array.isArray(src.extraRoots) ? src.extraRoots.filter(d => {
      try { return typeof d === 'string' && path.isAbsolute(d) && fs.statSync(d).isDirectory(); } catch (_) { return false; }
    }) : state.extraRoots;
    store.save({
      selectedId: state.selectedId,
      options: { ...state.options, ...(src.options && typeof src.options === 'object' ? src.options : {}) },
      rotation: { ...state.rotation, ...(src.rotation && typeof src.rotation === 'object' ? src.rotation : {}) },
      extraRoots: roots,
      hidden: Array.isArray(src.hidden) ? src.hidden : state.hidden,
    });
    state = store.load();
    resetRotation();
    await refresh(true);
    await pushOptions().catch(() => {});
    return json(res, 200, { ok: true, options: state.options, rotation: state.rotation, roots: state.extraRoots, projects: projects.map(slim) });
  }
  return json(res, 404, { error: '未知接口' });
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    // 网页壁纸以 blob iframe 挂载，子资源需要能从 file:// 页面跨源加载
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
      return res.end();
    }
    try {
      if (url.pathname === '/shim.js') return text(res, 200, SHIM, 'text/javascript; charset=utf-8');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
      if (url.pathname.startsWith('/preview/')) return servePreview(req, res, url);
      if (url.pathname.startsWith('/web/')) return serveWeb(req, res, url);
      if (url.pathname.startsWith('/scene-live')) return serveSceneLive(req, res, url);
      if (url.pathname.startsWith('/scene-engine/')) return serveSceneEngine(req, res, url);
      if (url.pathname.startsWith('/scene-files/')) return serveSceneFiles(req, res, url);
      if (req.method === 'GET' || req.method === 'HEAD') return servePublic(req, res, url);
      return json(res, 405, { error: '方法不支持' });
    } catch (err) {
      if (!res.headersSent) json(res, 500, { error: err.message || '服务器内部错误' });
      else res.end();
    }
  });
}

// 独立运行：固定占用一个端口，不做多端口回退，避免面板地址漂移
async function listen(server, port) {
  try {
    await new Promise((resolve, reject) => {
      const onError = err => { server.removeListener('listening', onOk); reject(err); };
      const onOk = () => { server.removeListener('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onOk);
      server.listen(port, '127.0.0.1');
    });
    return port;
  } catch (err) {
    if (err.code === 'EADDRINUSE') throw new Error('端口 ' + port + ' 已被占用（多半是已经有一个实例在运行）');
    throw err;
  }
}

// 断线/WorkBuddy 重启后自动补回壁纸层或空闲工具条
function startWatchdog() {
  setInterval(async () => {
    try {
      if (!state.selectedId) {
        await ensureIdleBar();
        return;
      }
      await refresh();
      const project = findProject(state.selectedId);
      if (!project) return;
      const installed = await cdp.evaluate(inject.buildProbe(project.id), { timeout: 4000 });
      if (!installed) await applyProject(project);
    } catch (_) {}
  }, 2000).unref();
}

async function start(options = {}) {
  const argv = process.argv.slice(2);
  const portArg = Number(argv[argv.indexOf('--port') + 1]);
  const requested = Number(options.port);
  const startPort = Number.isInteger(requested) && requested > 0
    ? requested
    : (Number.isInteger(portArg) && portArg > 0 ? portArg : 47850);
  const server = createServer();
  const port = await listen(server, startPort);
  base = `http://127.0.0.1:${port}`;
  dataMigration.migrate();
  // 迁移发生在模块加载之后，重新读一次，避免首次运行仍用默认配置
  state = store.load();
  if (!servicesStarted) {
    servicesStarted = true;
    wbPower.restore();
  }
  await refresh(true).catch(() => {});
  knownIds = new Set(projects.map(p => p.id));
  startWatchdog();
  startLibrarySync();
  startRotation();
  ensureIdleBar().catch(() => {});
  const panel = base + '/';
  console.log('');
  console.log('  ' + paths.APP_NAME + ' · WorkBuddy 壁纸');
  console.log('  ------------------------------------------------');
  console.log(`  控制面板  ${panel}`);
  console.log(`  数据目录  ${paths.DATA_DIR}`);
  console.log(`  已发现    ${projects.length} 个 Wallpaper Engine 工程`);
  cdp.resolvePort().then(p => console.log('  注入通道  CDP ' + p + '（已连接）'))
    .catch(err => console.log('  注入通道  ' + err.message));
  console.log('');
  return { server, port, base };
}

if (require.main === module) {
  start().catch(err => {
    console.error('[wbwe] 启动失败：' + err.message);
    process.exit(1);
  });
}

module.exports = { start };
