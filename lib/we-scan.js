'use strict';

// Wallpaper Engine 工坊项目扫描：只读取 project.json 与预览图，不修改 WE 目录。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const WE_APP_ID = '431960';
const TYPE_MAP = { video: 'video', web: 'web', scene: 'scene', picture: 'image', application: 'unsupported' };
const cache = new Map(); // dir -> { mtimeMs, item }

function registrySteamPath() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve('');
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { timeout: 3000, windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve('');
      const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout);
      resolve(m ? m[1].trim().replace(/\//g, '\\') : '');
    });
  });
}

function libraryRoots(steamPath) {
  const roots = new Map(); // 小写路径 -> 原始路径（Windows 大小写不敏感，避免同一库被扫描两次）
  const add = p => {
    if (!p) return;
    const resolved = path.resolve(p);
    roots.set(resolved.toLowerCase(), resolved);
  };
  add(steamPath);
  const vdf = steamPath && path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  try {
    const text = fs.readFileSync(vdf, 'utf8');
    for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) add(m[1].replace(/\\\\/g, '\\'));
  } catch (_) {}
  for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const rel of ['steam', 'Steam', 'SteamLibrary', 'steam-library', 'Program Files (x86)\\Steam']) {
      const p = `${drive}:\\${rel}`;
      if (fs.existsSync(path.join(p, 'steamapps'))) add(p);
    }
  }
  return [...roots.values()];
}

function readProject(dir) {
  const file = path.join(dir, 'project.json');
  let stat;
  try { stat = fs.statSync(file); } catch (_) { return null; }
  const hit = cache.get(dir);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit.item;

  let meta;
  try { meta = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
  const type = TYPE_MAP[String(meta.type || '').toLowerCase()];
  if (!type || type === 'unsupported') return null;

  const previewName = typeof meta.preview === 'string' ? meta.preview : '';
  const previewPath = previewName && fs.existsSync(path.join(dir, previewName)) ? path.join(dir, previewName) : '';
  let media = typeof meta.file === 'string' ? meta.file : '';
  if (!media && type === 'image') {
    media = fs.readdirSync(dir).find(f => /\.(png|jpe?g|webp|gif)$/i.test(f)) || '';
  }
  const mediaPath = media ? path.join(dir, media) : '';
  if ((type === 'video' || type === 'web') && !fs.existsSync(mediaPath)) return null;

  // Scene：工坊工程一般是 scene.pkg（project.json 的 file 常写 scene.json，盘上却只有 pkg）；
  // 官方 / 自制工程是松散目录（scene.json + materials/models/shaders）。
  let hasPkg = false;
  if (type === 'scene') {
    try { hasPkg = fs.readdirSync(dir).some(n => /\.pkg$/i.test(n)); } catch (_) {}
  }
  const looseScene = type === 'scene' && /\.json$/i.test(media) && fs.existsSync(mediaPath);
  const live = type === 'scene' && (hasPkg || looseScene);

  const workshop = path.basename(path.dirname(dir)) === WE_APP_ID;
  const item = {
    id: workshop ? path.basename(dir) : 'local-' + crypto.createHash('sha1').update(dir).digest('hex').slice(0, 10),
    dir,
    title: String(meta.title || path.basename(dir)).trim(),
    type,
    kind: type === 'video' ? 'video' : type === 'web' ? 'web' : live ? 'scene' : 'image',
    live,
    file: media,
    hasPreview: !!previewPath,
    tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 3).map(String) : [],
    sizeMb: mediaPath && fs.existsSync(mediaPath) ? Math.round(fs.statSync(mediaPath).size / 1048576) : 0,
    workshop,
  };
  cache.set(dir, { mtimeMs: stat.mtimeMs, item });
  return item;
}

// WE 在 defaultprojects\visibility.json 里用 {"文件夹名": false} 记录内置壁纸的删除/隐藏，
// 工程目录本身仍留在盘上；不读这个文件就会把已删除的内置壁纸继续列出来。
function readVisibility(base) {
  const hidden = new Set();
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(base, 'visibility.json'), 'utf8')); } catch (_) { return hidden; }
  if (data && typeof data === 'object') {
    for (const name of Object.keys(data)) if (data[name] === false) hidden.add(name.toLowerCase());
  }
  return hidden;
}

async function scan(state) {
  const steam = await registrySteamPath();
  const roots = new Set(libraryRoots(steam));
  for (const extra of (state && state.extraRoots) || []) roots.add(extra);

  const dirs = new Set();
  for (const root of roots) {
    for (const base of [
      path.join(root, 'steamapps', 'workshop', 'content', WE_APP_ID),
      path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'myprojects'),
      path.join(root, 'steamapps', 'common', 'wallpaper_engine', 'projects', 'defaultprojects'),
    ]) {
      let entries = [];
      try { entries = fs.readdirSync(base, { withFileTypes: true }); } catch (_) { continue; }
      const hidden = readVisibility(base);
      for (const e of entries) {
        if (!e.isDirectory() || hidden.has(e.name.toLowerCase())) continue;
        dirs.add(path.join(base, e.name));
      }
    }
  }

  const projects = [];
  for (const dir of dirs) {
    const item = readProject(dir);
    if (item) projects.push(item);
  }
  projects.sort((a, b) => (b.workshop - a.workshop) || a.title.localeCompare(b.title, 'zh-Hans-CN'));
  return projects;
}

module.exports = { scan, libraryRoots };
