'use strict';

const el = {
  grid: document.getElementById('grid'),
  count: document.getElementById('count'),
  hint: document.getElementById('hint'),
  search: document.getElementById('search'),
  chips: document.getElementById('chips'),
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
  statusIcon: document.getElementById('statusIcon'),
  toast: document.getElementById('toast'),
  mask: document.getElementById('mask'),
  maskVal: document.getElementById('maskVal'),
  blur: document.getElementById('blur'),
  blurVal: document.getElementById('blurVal'),
  fit: document.getElementById('fit'),
  glass: document.getElementById('glass'),
  perf: document.getElementById('perf'),
  sceneFps: document.getElementById('sceneFps'),
  parallax: document.getElementById('parallax'),
  audio: document.getElementById('audio'),
  cdpInfo: document.getElementById('cdpInfo'),
  connState: document.getElementById('connState'),
  gpuState: document.getElementById('gpuState'),
  gpuNote: document.getElementById('gpuNote'),
  relaunchRow: document.getElementById('relaunchRow'),
  relaunch: document.getElementById('relaunch'),
  quitApp: document.getElementById('quitApp'),
  refresh: document.getElementById('refresh'),
  clear: document.getElementById('clear'),
  addWallpaper: document.getElementById('addWallpaper'),
  filePicker: document.getElementById('filePicker'),
  transition: document.getElementById('transition'),
  videoRate: document.getElementById('videoRate'),
  rotationEnabled: document.getElementById('rotationEnabled'),
  rotationMinutes: document.getElementById('rotationMinutes'),
  rotationShuffle: document.getElementById('rotationShuffle'),
  roots: document.getElementById('roots'),
  rootInput: document.getElementById('rootInput'),
  rootAdd: document.getElementById('rootAdd'),
  presetExport: document.getElementById('presetExport'),
  presetImport: document.getElementById('presetImport'),
  presetPicker: document.getElementById('presetPicker'),
  nav: document.getElementById('nav'),
  content: document.querySelector('.content'),
  btnClose: document.getElementById('btnClose'),
  btnMin: document.getElementById('btnMin'),
  btnZoom: document.getElementById('btnZoom'),
  wbCurrentAvatar: document.getElementById('wbCurrentAvatar'),
  wbCurrentName: document.getElementById('wbCurrentName'),
  wbCurrentMeta: document.getElementById('wbCurrentMeta'),
  wbCurrentCheckin: document.getElementById('wbCurrentCheckin'),
  wbCurrentCredits: document.getElementById('wbCurrentCredits'),
  wbBackupBtn: document.getElementById('wbBackupBtn'),
  wbCheckinBtn: document.getElementById('wbCheckinBtn'),
  wbAddAccount: document.getElementById('wbAddAccount'),
  wbAccountsRefresh: document.getElementById('wbAccountsRefresh'),
  wbAccountsHint: document.getElementById('wbAccountsHint'),
  wbAccounts: document.getElementById('wbAccounts'),
  wbModels: document.getElementById('wbModels'),
  wbModelName: document.getElementById('wbModelName'),
  wbModelId: document.getElementById('wbModelId'),
  wbModelVendor: document.getElementById('wbModelVendor'),
  wbModelUrl: document.getElementById('wbModelUrl'),
  wbModelKey: document.getElementById('wbModelKey'),
  wbModelToolCall: document.getElementById('wbModelToolCall'),
  wbModelImages: document.getElementById('wbModelImages'),
  wbModelReasoning: document.getElementById('wbModelReasoning'),
  wbModelSave: document.getElementById('wbModelSave'),
  wbModelReset: document.getElementById('wbModelReset'),
  wbSessionSearch: document.getElementById('wbSessionSearch'),
  wbSessionAccount: document.getElementById('wbSessionAccount'),
  wbSessionDeleted: document.getElementById('wbSessionDeleted'),
  wbSessionAll: document.getElementById('wbSessionAll'),
  wbSessionsExport: document.getElementById('wbSessionsExport'),
  wbSessionsSynced: document.getElementById('wbSessionsSynced'),
  wbSessionsRefresh: document.getElementById('wbSessionsRefresh'),
  wbSessionsTarget: document.getElementById('wbSessionsTarget'),
  wbSessionsSync: document.getElementById('wbSessionsSync'),
  wbSessionsSyncHint: document.getElementById('wbSessionsSyncHint'),
  wbSessionsImport: document.getElementById('wbSessionsImport'),
  wbSessionsImportFile: document.getElementById('wbSessionsImportFile'),
  wbSessions: document.getElementById('wbSessions'),
  wbAboutMeta: document.getElementById('wbAboutMeta'),
  wbUpdateStatus: document.getElementById('wbUpdateStatus'),
  wbUpdateNotes: document.getElementById('wbUpdateNotes'),
  wbUpdateCheck: document.getElementById('wbUpdateCheck'),
  wbUpdateDownload: document.getElementById('wbUpdateDownload'),
  wbUpdateInstall: document.getElementById('wbUpdateInstall'),
  wbEnhanceDnd: document.getElementById('wbEnhanceDnd'),
  wbEnhanceAuto: document.getElementById('wbEnhanceAuto'),
  wbPowerState: document.getElementById('wbPowerState'),
  wbPowerMode: document.getElementById('wbPowerMode'),
  wbPowerDisplay: document.getElementById('wbPowerDisplay'),
  wbPowerSleep: document.getElementById('wbPowerSleep'),
  sheetInput: document.getElementById('sheetInput'),
  sheet: document.getElementById('sheet'),
  sheetIcon: document.getElementById('sheetIcon'),
  sheetTitle: document.getElementById('sheetTitle'),
  sheetMsg: document.getElementById('sheetMsg'),
  sheetOk: document.getElementById('sheetOk'),
  sheetCancel: document.getElementById('sheetCancel'),
};

const TYPE_LABEL = { video: '视频', web: '网页', scene: 'Scene', image: '图片' };
const EMBED = new URLSearchParams(location.search).get('embed') === '1';
const ICONS = {
  eye: '<path d="M2.6 12S6 6.2 12 6.2s9.4 5.8 9.4 5.8-3.4 5.8-9.4 5.8S2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/>',
  eyeOff: '<path d="M2.6 12S6 6.2 12 6.2s9.4 5.8 9.4 5.8-3.4 5.8-9.4 5.8S2.6 12 2.6 12Z"/><circle cx="12" cy="12" r="2.6"/><path d="M3.4 3.4 20.6 20.6"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="m6.8 7 .9 12h8.6l.9-12"/>',
  restart: '<path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20.4 4.4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11.4v5"/><circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  picture: '<rect x="3" y="3" width="18" height="18" rx="2.4"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="m3.6 17.4 5-5.2 3.6 3.6 3-2.9 5.2 5"/>',
  power: '<path d="M12 3.4v8"/><path d="M6.4 6.9a7.6 7.6 0 1 0 11.2 0"/>',
};

let snapshot = { projects: [], selectedId: '', options: {} };
let filterType = 'all';
let keyword = '';
let applying = false;
let toastTimer = 0;
let gridKey = '';
let sheetResolve = null;
let sheetPrevFocus = null;
let currentPane = 'accounts';

if (EMBED) document.body.classList.add('embed');

function svgIcon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}

function toast(message, isError) {
  el.toast.textContent = message;
  el.toast.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.className = 'toast'; }, 3200);
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (_) {
    throw new Error('连不上本机服务：请先双击 start.cmd（或 node server.js）再刷新本页');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error === '未知接口'
      ? '本机服务版本较旧，请退出并重新运行 start.cmd 后再试'
      : (data.error || ('请求失败 ' + res.status)));
  }
  return data;
}

// ---------- macOS 风格确认对话框 ----------
function confirmSheet(opts) {
  if (sheetResolve) closeSheet(false);
  sheetPrevFocus = document.activeElement;
  el.sheetIcon.className = 'sheet-icon' + (opts.danger ? ' danger' : '');
  el.sheetIcon.innerHTML = svgIcon(opts.icon || 'info');
  el.sheetTitle.textContent = opts.title || '';
  el.sheetMsg.textContent = opts.message || '';
  el.sheetOk.textContent = opts.ok || '好';
  el.sheetOk.className = 'btn ' + (opts.danger ? 'danger' : 'primary');
  el.sheetInput.hidden = !opts.input;
  el.sheetInput.value = opts.input ? String(opts.value || '') : '';
  el.sheetInput.placeholder = opts.placeholder || '';
  el.sheet.hidden = false;
  setTimeout(() => {
    try { (opts.input ? el.sheetInput : el.sheetOk).focus(); } catch (_) {}
    if (opts.input) { try { el.sheetInput.select(); } catch (_) {} }
  }, 0);
  return new Promise(resolve => { sheetResolve = resolve; });
}

function closeSheet(ok) {
  if (el.sheet.hidden) return;
  el.sheet.hidden = true;
  const resolve = sheetResolve;
  sheetResolve = null;
  if (resolve) resolve(ok);
  if (sheetPrevFocus && sheetPrevFocus.focus) {
    try { sheetPrevFocus.focus(); } catch (_) {}
  }
  sheetPrevFocus = null;
}

// ---------- 状态 ----------
function setStatus(data) {
  const on = !!data.connected;
  el.status.classList.remove('on', 'off');
  el.status.classList.add(on ? 'on' : 'off');
  el.statusText.textContent = on ? '已连接' : '未连接';
  el.connState.textContent = on ? '已连接' : '未连接';
  el.connState.className = 'row-value ' + (on ? 'good' : 'bad');

  const cdp = data.cdp || {};
  const port = cdp.port || '—';
  el.cdpInfo.textContent = 'CDP ' + port + (on ? ' · 注入通道正常' : (cdp.error ? ' · ' + cdp.error : ' · 等待 WorkBuddy'));
  el.status.title = 'CDP ' + port + (on ? ' · 已连接 WorkBuddy' : ' · 未连接 WorkBuddy');

  const g = data.gpu || {};
  if (!on) {
    el.gpuState.textContent = '—';
    el.gpuState.className = 'row-value';
    el.gpuNote.textContent = '连接 WorkBuddy 后检测硬件加速状态';
  } else if (g.software) {
    el.gpuState.textContent = '软件渲染';
    el.gpuState.className = 'row-value bad';
    el.gpuNote.textContent = '硬件加速已关闭，壁纸会明显卡顿；重启 WorkBuddy 可尝试恢复。';
  } else {
    el.gpuState.textContent = g.renderer ? '正常' : '未知';
    el.gpuState.className = 'row-value ' + (g.renderer ? 'good' : '');
    el.gpuNote.textContent = g.renderer ? 'GPU 硬件加速正常工作' : '未能读取 GPU 渲染器信息';
  }

  const icon = !on
    ? (cdp.error ? 'state-error' : 'state-offline')
    : (g.software ? 'state-warning' : 'state-normal');
  if (el.statusIcon) el.statusIcon.src = '/assets/brand/' + icon + '.png';

  el.relaunchRow.style.display = on ? 'none' : 'flex';
}

function visibleProjects() {
  const kw = keyword.trim().toLowerCase();
  return snapshot.projects.filter(p => {
    if (filterType === 'hidden') {
      if (!p.hidden) return false;
    } else {
      if (p.hidden) return false;
      if (filterType === 'custom' && !p.custom) return false;
      if (filterType !== 'all' && filterType !== 'custom' && p.type !== filterType) return false;
    }
    if (!kw) return true;
    return (p.title + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(kw);
  });
}

function detailSpans(p) {
  if (p.custom) return ['自定义', p.sizeMb ? p.sizeMb + ' MB' : '本机文件'];
  if (p.kind === 'web') return ['网页挂载', '实时渲染'];
  if (p.type === 'scene') return p.live ? ['Scene 实时渲染', 'WebGL'] : ['Scene 预览'];
  return [p.sizeMb ? p.sizeMb + ' MB' : '本机文件'];
}

function renderGrid() {
  const list = visibleProjects();
  el.count.textContent = `${list.length} / ${snapshot.projects.length} 个壁纸`;
  const fresh = (snapshot.newProjects || []).length;
  el.hint.textContent = fresh
    ? `发现 ${fresh} 个新壁纸，已自动加入壁纸库`
    : '点击卡片即应用 · 也可以把图片或视频拖进来';

  el.grid.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const text = snapshot.projects.length
      ? (filterType === 'hidden' ? '没有隐藏的壁纸' : '没有匹配的壁纸，换个关键词试试')
      : '没有发现 Wallpaper Engine 工程。请确认已订阅工坊壁纸，或 WorkBuddy 与 Steam 在同一台机器上。';
    empty.innerHTML = svgIcon('picture') + '<span></span>';
    empty.querySelector('span').textContent = text;
    el.grid.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const p of list) {
    const card = document.createElement('article');
    card.className = 'card' + (p.id === snapshot.selectedId ? ' active' : '') + (p.hidden ? ' hidden' : '');
    card.title = p.note || p.title;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (p.previewVideo) {
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = p.previewVideo;
      thumb.appendChild(video);
    } else if (p.preview) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = p.preview;
      img.alt = p.title;
      thumb.appendChild(img);
    } else {
      const fallback = document.createElement('div');
      fallback.className = 'fallback';
      fallback.textContent = '◈';
      thumb.appendChild(fallback);
    }

    const badge = document.createElement('span');
    badge.className = 'badge ' + p.type;
    badge.textContent = TYPE_LABEL[p.type] || p.type;
    thumb.appendChild(badge);

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'card-act';
    hide.title = p.hidden ? '恢复显示这个壁纸' : '从壁纸库隐藏（不参与轮播）';
    hide.innerHTML = svgIcon(p.hidden ? 'eye' : 'eyeOff');
    hide.addEventListener('click', async ev => {
      ev.stopPropagation();
      try {
        await api('/api/hide', { id: p.id, hidden: !p.hidden });
        p.hidden = !p.hidden;
        gridKey = gridSignature(snapshot);
        renderGrid();
        toast((p.hidden ? '已隐藏：' : '已恢复：') + p.title);
      } catch (err) {
        toast(err.message, true);
      }
    });
    actions.appendChild(hide);

    if (p.custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'card-act danger';
      del.title = '删除这个自定义壁纸';
      del.innerHTML = svgIcon('trash');
      del.addEventListener('click', async ev => {
        ev.stopPropagation();
        const ok = await confirmSheet({
          icon: 'trash',
          danger: true,
          title: '删除这个壁纸？',
          message: '「' + p.title + '」将从本机自定义壁纸库移除，无法撤销。',
          ok: '删除',
        });
        if (!ok) return;
        try {
          const data = await api('/api/custom/delete', { id: p.id });
          snapshot.projects = data.projects;
          if (snapshot.selectedId === p.id) snapshot.selectedId = '';
          gridKey = gridSignature(snapshot);
          renderGrid();
          toast('已删除：' + p.title);
        } catch (err) {
          toast(err.message, true);
        }
      });
      actions.appendChild(del);
    }
    thumb.appendChild(actions);

    const body = document.createElement('div');
    body.className = 'card-body';
    const h3 = document.createElement('h3');
    h3.textContent = p.title;
    const sub = document.createElement('div');
    sub.className = 'sub';

    if (p.id === snapshot.selectedId) {
      const tag = document.createElement('span');
      tag.className = 'tag using';
      tag.textContent = '使用中';
      sub.appendChild(tag);
    } else if (p.isNew) {
      const tag = document.createElement('span');
      tag.className = 'tag new';
      tag.textContent = '新';
      sub.appendChild(tag);
    }
    const parts = detailSpans(p);
    parts.forEach((text, i) => {
      if (i > 0) {
        const dot = document.createElement('span');
        dot.textContent = '·';
        sub.appendChild(dot);
      }
      const span = document.createElement('span');
      span.textContent = text;
      sub.appendChild(span);
    });

    body.append(h3, sub);
    card.append(thumb, body);
    card.addEventListener('click', () => applyProject(p));
    card.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        applyProject(p);
      }
    });
    frag.appendChild(card);
  }
  el.grid.appendChild(frag);
}

// ---------- 输入同步 ----------
function paintRange(input) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const val = Number(input.value) || 0;
  const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--fill', pct.toFixed(2) + '%');
}

function syncInputs() {
  const o = snapshot.options || {};
  if (document.activeElement !== el.mask) el.mask.value = o.mask ?? 0.25;
  if (document.activeElement !== el.blur) el.blur.value = o.blur ?? 0;
  paintRange(el.mask);
  paintRange(el.blur);
  el.maskVal.textContent = Number(el.mask.value).toFixed(2);
  el.blurVal.textContent = Math.round(Number(el.blur.value)) + ' px';
  el.fit.value = o.fit || 'cover';
  el.glass.checked = o.glass !== false;
  el.perf.checked = o.perf !== false;
  el.sceneFps.value = String(o.sceneFps || 60);
  el.parallax.checked = o.parallax !== false;
  el.audio.checked = o.audio === true;
  const tr = Number(o.transition ?? 0.4);
  el.transition.value = [0, 0.2, 0.4, 0.6, 1, 1.5].includes(tr) ? String(tr) : '0.4';
  el.videoRate.value = String(o.videoRate ?? 1);
  const rot = snapshot.rotation || {};
  el.rotationEnabled.checked = rot.enabled === true;
  el.rotationMinutes.value = String(rot.minutes || 30);
  el.rotationShuffle.checked = rot.shuffle !== false;
  renderRoots();
}

function renderRoots() {
  const roots = snapshot.roots || [];
  const key = roots.join('|');
  if (el.roots.dataset.key === key) return;
  el.roots.dataset.key = key;
  el.roots.innerHTML = '';
  if (!roots.length) {
    const empty = document.createElement('div');
    empty.className = 'roots-empty';
    empty.textContent = '使用默认的 Steam 工坊目录';
    el.roots.appendChild(empty);
    return;
  }
  for (const dir of roots) {
    const row = document.createElement('div');
    row.className = 'root-item';
    const span = document.createElement('span');
    span.textContent = dir;
    span.title = dir;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '✕';
    btn.title = '移除这个目录';
    btn.addEventListener('click', async () => {
      try {
        const data = await api('/api/roots/remove', { dir });
        snapshot.roots = data.roots;
        snapshot.projects = data.projects;
        gridKey = gridSignature(snapshot);
        renderGrid();
        toast('已移除目录');
      } catch (err) {
        toast(err.message, true);
      }
    });
    row.append(span, btn);
    el.roots.appendChild(row);
  }
}

function gridSignature(data) {
  return (data.projects || []).map(p => p.id + (p.isNew ? '*' : '') + (p.hidden ? '~' : '')).join('|')
    + '#' + (data.selectedId || '');
}

function render(data) {
  const prevVersion = snapshot.libraryVersion;
  snapshot = data;
  setStatus(data);
  syncInputs();
  const key = gridSignature(data);
  if (key !== gridKey) {
    gridKey = key;
    // 壁纸库不在前台时先不建卡片、不加载预览图，等切过去再渲染
    if (currentPane === 'library') renderGrid();
  }
  if (prevVersion !== undefined && data.libraryVersion !== prevVersion) {
    const fresh = data.newProjects || [];
    toast(fresh.length
      ? '发现 ' + fresh.length + ' 个新壁纸：' + fresh.slice(0, 2).map(p => p.title).join('、')
      : (data.notice || '壁纸库已更新'));
  }
}

async function load() {
  try {
    render(await api('/api/state'));
  } catch (err) {
    if (el.statusIcon) el.statusIcon.src = '/assets/brand/state-error.png';
    toast(err.message, true);
  }
}

async function applyProject(p) {
  if (applying) return;
  applying = true;
  try {
    await api('/api/apply', { id: p.id });
    snapshot.selectedId = p.id;
    snapshot.projects = snapshot.projects.map(x => x.id === p.id ? { ...x, isNew: false } : x);
    snapshot.newProjects = (snapshot.newProjects || []).filter(x => x.id !== p.id);
    gridKey = gridSignature(snapshot);
    renderGrid();
    toast('已应用：' + p.title);
    if (p.note) setTimeout(() => toast(p.note), 1200);
  } catch (err) {
    toast(err.message, true);
  } finally {
    applying = false;
  }
}

let optionsTimer = 0;
async function pushOptions(patch, label) {
  snapshot.options = { ...snapshot.options, ...patch };
  clearTimeout(optionsTimer);
  optionsTimer = setTimeout(async () => {
    try {
      const data = await api('/api/options', patch);
      snapshot.options = data.options;
    } catch (err) {
      toast(err.message, true);
    }
  }, 180);
  if (label) toast(label);
}

// ---------- 侧边栏 ----------
function showPane(name) {
  currentPane = name;
  [...el.nav.querySelectorAll('.nav-item')].forEach(b => {
    b.classList.toggle('active', b.dataset.pane === name);
  });
  [...document.querySelectorAll('.pane')].forEach(p => {
    p.classList.toggle('active', p.dataset.pane === name);
  });
  el.content.scrollTop = 0;
  if (name === 'accounts') {
    loadWbAccounts()
      .then(() => {
        refreshWbCredits({ silent: true });
        autoCheckinCurrent();
      })
      .catch(err => toast(err.message, true));
  }
  if (name === 'library') {
    if (snapshot.projects && snapshot.projects.length) renderGrid();
    load();
  }
  if (name === 'connection') load();
  if (name === 'models') loadWbModels().catch(err => toast(err.message, true));
  if (name === 'sessions') loadWbSessions().catch(err => toast(err.message, true));
  if (name === 'enhance') loadWbEnhance().catch(err => toast(err.message, true));
  if (name === 'power') loadWbPower().catch(err => toast(err.message, true));
  if (name === 'about') loadWbAbout().catch(err => toast(err.message, true));
}

el.nav.addEventListener('click', ev => {
  const item = ev.target.closest('.nav-item');
  if (item) showPane(item.dataset.pane);
});

el.status.addEventListener('click', () => showPane('connection'));

// ---------- 交通灯 ----------
function postToParent(type) {
  try {
    (window.parent || window).postMessage({ __wbwe: 1, type }, '*');
  } catch (_) {}
}

el.btnClose.addEventListener('click', () => {
  if (EMBED) {
    postToParent('close-panel');
    return;
  }
  try { window.close(); } catch (_) {}
  setTimeout(() => {
    try { if (!window.closed) toast('请直接关闭这个标签页'); } catch (_) {}
  }, 160);
});

el.btnMin.addEventListener('click', () => {
  if (EMBED) {
    postToParent('minimize-panel');
    return;
  }
  toast('最小化只在 WorkBuddy 内嵌面板中可用');
});

el.btnZoom.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (_) {
    toast('当前环境不允许全屏');
  }
});

document.addEventListener('fullscreenchange', () => {
  el.btnZoom.title = document.fullscreenElement ? '退出全屏' : '全屏';
});

// ---------- 壁纸库 ----------
el.search.addEventListener('input', () => { keyword = el.search.value; renderGrid(); });
el.search.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') {
    ev.stopPropagation();
    el.search.value = '';
    keyword = '';
    renderGrid();
    el.search.blur();
  }
});

el.chips.addEventListener('click', ev => {
  const chip = ev.target.closest('button[data-type]');
  if (!chip) return;
  filterType = chip.dataset.type;
  [...el.chips.querySelectorAll('button')].forEach(c => c.classList.toggle('active', c === chip));
  renderGrid();
});

el.refresh.addEventListener('click', async () => {
  try {
    const data = await api('/api/projects');
    snapshot.projects = data.projects;
    gridKey = gridSignature(snapshot);
    renderGrid();
    toast('壁纸库已刷新');
  } catch (err) {
    toast(err.message, true);
  }
});

el.clear.addEventListener('click', async () => {
  try {
    await api('/api/clear', {});
    snapshot.selectedId = '';
    gridKey = gridSignature(snapshot);
    renderGrid();
    toast('已清除壁纸层');
  } catch (err) {
    toast(err.message, true);
  }
});

el.relaunch.addEventListener('click', async () => {
  const ok = await confirmSheet({
    icon: 'restart',
    title: '重新启动 WorkBuddy？',
    message: '将关闭并带调试端口重新启动，聊天记录会保留。',
    ok: '重启',
  });
  if (!ok) return;
  try {
    const data = await api('/api/relaunch', {});
    toast('已重启 WorkBuddy（CDP ' + data.port + '），稍等几秒自动接管');
  } catch (err) {
    toast(err.message, true);
  }
});

el.quitApp.addEventListener('click', async () => {
  const ok = await confirmSheet({
    icon: 'power',
    danger: true,
    title: '退出 workbuddyEVA？',
    message: '壁纸服务会停止，WorkBuddy 里的壁纸层和右下角图标会被撤掉；本页可以关闭。下次双击桌面图标即可恢复。',
    ok: '退出',
  });
  if (!ok) return;
  try {
    await api('/api/quit', {});
  } catch (_) {}
  el.status.classList.remove('on', 'off');
  el.status.classList.add('off');
  el.statusText.textContent = '已退出';
  el.connState.textContent = '已退出';
  el.connState.className = 'row-value bad';
  el.quitApp.disabled = true;
  toast('已退出 workbuddyEVA，本页可以关闭');
});

// ---------- 外观 / 播放 ----------
el.mask.addEventListener('input', () => {
  paintRange(el.mask);
  el.maskVal.textContent = Number(el.mask.value).toFixed(2);
  pushOptions({ mask: Number(el.mask.value) });
});
el.blur.addEventListener('input', () => {
  paintRange(el.blur);
  el.blurVal.textContent = Math.round(Number(el.blur.value)) + ' px';
  pushOptions({ blur: Number(el.blur.value) });
});
el.fit.addEventListener('change', () => pushOptions({ fit: el.fit.value }, '填充方式：' + el.fit.selectedOptions[0].textContent));
el.glass.addEventListener('change', () => pushOptions({ glass: el.glass.checked }, el.glass.checked ? '已开启液态玻璃' : '已关闭液态玻璃'));
el.perf.addEventListener('change', () => pushOptions({ perf: el.perf.checked }, el.perf.checked ? '已开启性能模式' : '已关闭性能模式（界面毛玻璃会拖低帧率）'));
el.sceneFps.addEventListener('change', () => pushOptions({ sceneFps: Number(el.sceneFps.value) }, 'Scene 帧率：' + el.sceneFps.value + ' fps'));
el.parallax.addEventListener('change', () => pushOptions({ parallax: el.parallax.checked }, el.parallax.checked ? '已开启鼠标视差与交互转发' : '已关闭鼠标视差'));
el.audio.addEventListener('change', () => pushOptions({ audio: el.audio.checked }, el.audio.checked ? '已开启视频声音' : '已静音'));
el.transition.addEventListener('change', () => pushOptions({ transition: Number(el.transition.value) }, '切换过渡：' + (Number(el.transition.value) ? el.transition.value + ' 秒' : '关闭')));
el.videoRate.addEventListener('change', () => pushOptions({ videoRate: Number(el.videoRate.value) }, '视频速度：' + el.videoRate.value + '×'));

// ---------- 自动轮播 ----------
async function pushRotation(patch, label) {
  snapshot.rotation = { ...(snapshot.rotation || {}), ...patch };
  try {
    const data = await api('/api/rotation', patch);
    snapshot.rotation = data.rotation;
  } catch (err) {
    toast(err.message, true);
  }
  if (label) toast(label);
}
el.rotationEnabled.addEventListener('change', () => pushRotation(
  { enabled: el.rotationEnabled.checked },
  el.rotationEnabled.checked ? '已开启自动轮播（每 ' + el.rotationMinutes.value + ' 分钟）' : '已关闭自动轮播'));
el.rotationMinutes.addEventListener('change', () => pushRotation({ minutes: Number(el.rotationMinutes.value) }, '轮播间隔：' + el.rotationMinutes.value + ' 分钟'));
el.rotationShuffle.addEventListener('change', () => pushRotation({ shuffle: el.rotationShuffle.checked }, el.rotationShuffle.checked ? '轮播：随机顺序' : '轮播：按库顺序'));

// ---------- 壁纸目录 ----------
async function addRoot() {
  const dir = el.rootInput.value.trim();
  if (!dir) return;
  try {
    const data = await api('/api/roots', { dir });
    el.rootInput.value = '';
    snapshot.roots = data.roots;
    snapshot.projects = data.projects;
    gridKey = gridSignature(snapshot);
    renderGrid();
    toast('已添加目录，发现 ' + data.projects.length + ' 个壁纸');
  } catch (err) {
    toast(err.message, true);
  }
}
el.rootAdd.addEventListener('click', addRoot);
el.rootInput.addEventListener('keydown', ev => { if (ev.key === 'Enter') addRoot(); });

// ---------- 预设：导出 / 导入 ----------
el.presetExport.addEventListener('click', async () => {
  try {
    const data = await api('/api/preset');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'workbuddy-eva-preset.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('预设已导出');
  } catch (err) {
    toast(err.message, true);
  }
});
el.presetImport.addEventListener('click', () => el.presetPicker.click());
el.presetPicker.addEventListener('change', async () => {
  const file = el.presetPicker.files[0];
  el.presetPicker.value = '';
  if (!file) return;
  try {
    const preset = JSON.parse(await file.text());
    const data = await api('/api/preset', { preset });
    render({ ...snapshot, options: data.options, rotation: data.rotation, roots: data.roots, projects: data.projects });
    toast('预设已导入：' + file.name);
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- 自定义壁纸：选择文件 / 拖拽上传 ----------
async function uploadFiles(files) {
  const list = [...files].filter(f => /\.(jpe?g|png|webp|gif|bmp|mp4|webm|mov|mkv|m4v)$/i.test(f.name));
  if (!list.length) {
    if (files.length) toast('只支持图片（jpg/png/webp/gif）和视频（mp4/webm/mov/mkv）', true);
    return;
  }
  for (const f of list) {
    try {
      toast('正在上传：' + f.name);
      const res = await fetch('/api/custom', {
        method: 'POST',
        headers: { 'X-Filename': encodeURIComponent(f.name) },
        body: f,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ('上传失败 ' + res.status));
    } catch (err) {
      toast(f.name + '：' + err.message, true);
    }
  }
  await load();
  toast('已添加 ' + list.length + ' 个自定义壁纸');
}

el.addWallpaper.addEventListener('click', () => el.filePicker.click());
el.filePicker.addEventListener('change', () => {
  const files = [...el.filePicker.files];
  el.filePicker.value = '';
  uploadFiles(files);
});
el.grid.addEventListener('dragover', ev => { ev.preventDefault(); el.grid.classList.add('dropping'); });
el.grid.addEventListener('dragleave', () => el.grid.classList.remove('dropping'));
el.grid.addEventListener('drop', ev => {
  ev.preventDefault();
  el.grid.classList.remove('dropping');
  uploadFiles(ev.dataTransfer.files);
});

// ---------- WorkBuddy 账号 / 模型 ----------
const wbCreditCache = new Map();
const wbCheckinCache = new Map();
let editingModelId = '';
let wbAccountsLoading = false;
let wbAccountsRefreshing = false;
let wbAccountsLastRefresh = 0;
let wbAccountsTicks = 0;
let wbAccountsKey = '';
let wbAccountsData = { current: null, accounts: [], state: null };

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function shortUid(uid) {
  const text = String(uid || '');
  return text.length > 12 ? text.slice(0, 8) + '…' : text;
}

function formatDay(ms) {
  const date = new Date(Number(ms) || 0);
  if (!Number(ms)) return '未知';
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function accountType(type) {
  const value = String(type || '').toLowerCase();
  if (value === 'personal') return '个人版';
  if (value === 'enterprise') return '企业版';
  return value || '';
}

function applyAccountState(state) {
  if (!state) return;
  for (const [uid, row] of Object.entries(state.credits || {})) wbCreditCache.set(uid, row);
  for (const [uid, row] of Object.entries(state.checkin || {})) wbCheckinCache.set(uid, row);
}

function creditValue(uid) {
  const row = wbCreditCache.get(uid);
  if (!row) return undefined;
  if (!row.ok) return 'error';
  return row.unlimited ? 'unlimited' : row.credits;
}

function creditText(value) {
  if (value === undefined || value === null) return '额度 —';
  if (value === 'error') return '额度查询失败';
  if (value === 'unlimited') return '不限量';
  return Number(value).toFixed(2).replace(/\.00$/, '') + ' 积分';
}

function checkinText(uid) {
  const row = wbCheckinCache.get(uid);
  if (!row || !row.today) return '今日签到 —';
  if (row.ok) return row.already ? '今日已签到' : '今日签到成功';
  if (row.inactive) return '签到未开放';
  return '今日未签到' + (row.message ? '（' + row.message + '）' : '');
}

function checkinBadge(uid) {
  const row = wbCheckinCache.get(uid);
  if (!row || !row.today) return '';
  if (row.ok) return '<span class="wb-badge">今日已签到</span>';
  if (row.inactive) return '<span class="wb-badge">签到未开放</span>';
  return '<span class="wb-badge warn">今日未签到</span>';
}

function renderWbAccounts(data) {
  const current = data.current || null;
  if (current) {
    const name = current.nickname && current.nickname !== '(已加密)' ? current.nickname : '当前账号';
    el.wbCurrentAvatar.textContent = name.slice(0, 1).toUpperCase();
    el.wbCurrentName.textContent = name;
    el.wbCurrentMeta.textContent = shortUid(current.uid) + ' · ' + (accountType(current.type) || 'WorkBuddy')
      + (current.tokenExpired ? ' · 登录已过期' : '');
    el.wbCurrentCheckin.textContent = checkinText(current.uid);
  } else {
    el.wbCurrentAvatar.textContent = '—';
    el.wbCurrentName.textContent = '未检测到登录信息';
    el.wbCurrentMeta.textContent = '请先在 WorkBuddy 中登录';
    el.wbCurrentCheckin.textContent = '今日签到 —';
  }
  const currentCredit = current ? wbCreditCache.get(current.uid) : null;
  el.wbCurrentCredits.textContent = creditText(current ? creditValue(current.uid) : undefined);
  el.wbCurrentCredits.title = currentCredit && currentCredit.error ? currentCredit.error : '';

  const rows = data.accounts || [];
  if (!rows.length) {
    el.wbAccounts.innerHTML = '<p class="hint-block">还没有账号备份。登录新账号后会自动备份，也可以点「备份当前账号」。</p>';
    return;
  }
  el.wbAccounts.innerHTML = rows.map((row) => {
    const name = row.nickname && row.nickname !== '(已加密)' ? row.nickname : shortUid(row.uid);
    const credit = wbCreditCache.get(row.uid);
    const badges = [];
    if (row.current) badges.push('<span class="wb-badge">当前</span>');
    if (row.tokenExpired) badges.push('<span class="wb-badge warn">已过期</span>');
    const checkin = checkinBadge(row.uid);
    if (checkin) badges.push(checkin);
    return ''
      + '<div class="wb-item" data-uid="' + esc(row.uid) + '">'
      + '<div class="wb-item-avatar">' + esc(name.slice(0, 1).toUpperCase()) + '</div>'
      + '<div class="wb-item-body">'
      + '<div class="wb-item-title">' + esc(name) + ' ' + badges.join('') + '</div>'
      + '<div class="wb-item-meta">' + esc(shortUid(row.uid))
      + (accountType(row.type) ? ' · ' + esc(accountType(row.type)) : '')
      + (row.note ? ' · ' + esc(row.note) : '')
      + ' · 备份 ' + esc(formatDay(row.savedAt)) + '</div>'
      + '</div>'
      + '<div class="wb-item-side">'
      + '<span class="wb-credit" data-credit="' + esc(row.uid) + '"'
      + (credit && credit.error ? ' title="' + esc(credit.error) + '"' : '') + '>'
      + creditText(creditValue(row.uid)) + '</span>'
      + '<div class="wb-item-actions">'
      + (row.current ? '' : '<button class="btn small" data-act="switch" type="button">切换</button>')
      + '<button class="btn small" data-act="checkin" type="button">签到</button>'
      + '<button class="btn small" data-act="credits" type="button">查额度</button>'
      + (row.current ? '' : '<button class="btn small danger" data-act="delete" type="button">删除</button>')
      + '</div></div></div>';
  }).join('');
}

async function loadWbAccounts(options = {}) {
  if (wbAccountsLoading) return;
  wbAccountsLoading = true;
  try {
    const data = await api('/api/wb/accounts');
    applyAccountState(data.state);
    wbAccountsData = { current: data.current || null, accounts: data.accounts || [], state: data.state || null };
    const key = JSON.stringify(wbAccountsData);
    if (key !== wbAccountsKey || !options.silent) {
      wbAccountsKey = key;
      renderWbAccounts(wbAccountsData);
    }
  } finally {
    wbAccountsLoading = false;
  }
}

async function refreshWbCredits(options = {}) {
  if (wbAccountsRefreshing) return;
  if (Date.now() - wbAccountsLastRefresh < 60000) return;
  wbAccountsRefreshing = true;
  try {
    const data = await api('/api/wb/accounts/refresh', {});
    wbAccountsLastRefresh = Date.now();
    applyAccountState(data.state);
    renderWbAccounts(wbAccountsData);
    if (!options.silent) {
      const results = Object.values(data.results || {});
      const failed = results.filter(row => !row.ok);
      if (!results.length) toast('没有可查询的账号');
      else if (failed.length) toast('额度刷新完成，' + failed.length + ' 个账号失败：' + (failed[0].error || '未知错误'), true);
      else toast('额度已刷新');
    }
  } catch (err) {
    if (!options.silent) toast(err.message, true);
  } finally {
    wbAccountsRefreshing = false;
  }
}

// 停留在账号页时自动同步登录态与额度
setInterval(() => {
  if (currentPane !== 'accounts') {
    wbAccountsTicks = 0;
    return;
  }
  wbAccountsTicks += 1;
  loadWbAccounts({ silent: true }).catch(() => {});
  if (wbAccountsTicks % 3 === 0) refreshWbCredits({ silent: true }).catch(() => {});
}, 20000);

// 打开账号页时自动确认今日签到；接口本身幂等，已签到会返回已签到
let wbAutoCheckinAt = 0;
async function autoCheckinCurrent() {
  const current = wbAccountsData.current;
  if (!current || !current.hasToken) return;
  const cached = wbCheckinCache.get(current.uid);
  if (cached && cached.today) return;
  if (Date.now() - wbAutoCheckinAt < 5 * 60 * 1000) return;
  wbAutoCheckinAt = Date.now();
  try {
    await api('/api/wb/accounts/checkin', { uid: current.uid });
    await loadWbAccounts({ silent: true });
  } catch (_) {}
}

el.wbBackupBtn.addEventListener('click', async () => {
  try {
    const data = await api('/api/wb/accounts/backup', {});
    toast('已备份账号 ' + (data.account.nickname || data.account.uid));
    await loadWbAccounts();
    await refreshWbCredits({ silent: true });
  } catch (err) {
    toast(err.message, true);
  }
});

el.wbAccountsRefresh.addEventListener('click', () => {
  wbAccountsLastRefresh = 0;
  loadWbAccounts()
    .then(() => refreshWbCredits({ silent: true }))
    .then(() => toast('账号与额度已刷新'))
    .catch(err => toast(err.message, true));
});

el.wbCheckinBtn.addEventListener('click', async () => {
  const current = wbAccountsData.current;
  if (!current) return toast('请先在 WorkBuddy 中登录', true);
  const previous = el.wbCheckinBtn.textContent;
  el.wbCheckinBtn.disabled = true;
  el.wbCheckinBtn.textContent = '签到中…';
  try {
    const data = await api('/api/wb/accounts/checkin', { uid: current.uid });
    toast(data.ok ? (data.already ? '今日已签到' : '签到成功') : (data.message || '签到失败'), !data.ok);
    await loadWbAccounts({ silent: true });
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.wbCheckinBtn.disabled = false;
    el.wbCheckinBtn.textContent = previous;
  }
});

el.wbAddAccount.addEventListener('click', async () => {
  try {
    const ok = await confirmSheet({
      icon: 'restart',
      danger: true,
      title: '登录新账号？',
      message: '当前账号会先自动备份，然后关闭 WorkBuddy 并重启到登录页。登录完成后重新打开控制面板，新账号会自动备份。',
      ok: '备份并重启',
    });
    if (!ok) return;
    await api('/api/wb/accounts/login', {});
    el.wbAccountsHint.textContent = 'WorkBuddy 即将重启，请在登录页登录新账号';
    toast('WorkBuddy 正在重启，登录完成后重新打开面板');
  } catch (err) {
    toast(err.message, true);
  }
});

el.wbAccounts.addEventListener('click', async (ev) => {
  const button = ev.target.closest('button[data-act]');
  const item = ev.target.closest('.wb-item');
  if (!button || !item) return;
  const uid = item.dataset.uid;
  const act = button.getAttribute('data-act');
  const name = item.querySelector('.wb-item-title').textContent.trim();
  try {
    if (act === 'switch') {
      const ok = await confirmSheet({
        icon: 'restart',
        title: '切换到这个账号？',
        message: '当前账号的会话会一并同步到目标账号，然后刷新 WorkBuddy 窗口。',
        ok: '切换',
      });
      if (!ok) return;
      button.disabled = true;
      button.textContent = '切换中…';
      const data = await api('/api/wb/accounts/switch', { uid });
      const copied = data.sync && !data.sync.error && data.sync.copied ? data.sync.copied.length : 0;
      const syncError = data.sync && data.sync.error;
      toast('已切换到 ' + (data.account.nickname || name)
        + (copied ? '，同步 ' + copied + ' 个会话' : '')
        + (syncError ? '，会话同步失败：' + syncError : '')
        + (data.reloaded ? '，窗口正在刷新' : ''), !!syncError);
      setTimeout(() => loadWbAccounts().catch(() => {}), 1500);
      setTimeout(() => loadWbSessions({ silent: true }).catch(() => {}), 3000);
      return;
    }
    if (act === 'checkin') {
      button.disabled = true;
      button.textContent = '签到中…';
      const data = await api('/api/wb/accounts/checkin', { uid });
      toast(data.ok ? (data.already ? '今日已签到' : '签到成功') : (data.message || '签到失败'), !data.ok);
      await loadWbAccounts({ silent: true });
      return;
    }
    if (act === 'credits') {
      button.disabled = true;
      button.textContent = '查询中…';
      const data = await api('/api/wb/accounts/credits', { uid });
      wbCreditCache.set(uid, { ok: true, credits: data.credits, unlimited: !!data.unlimited, todayUsage: data.todayUsage, at: Date.now() });
      renderWbAccounts(wbAccountsData);
      toast(data.unlimited ? '该账号额度不限量' : ('剩余 ' + creditText(data.credits)));
      return;
    }
    if (act === 'delete') {
      const ok = await confirmSheet({
        icon: 'trash',
        danger: true,
        title: '删除账号备份？',
        message: '只删除本程序保存的登录备份，不会退出 WorkBuddy 当前账号。',
        ok: '删除',
      });
      if (!ok) return;
      await api('/api/wb/accounts/delete', { uid });
      toast('已删除账号备份');
      await loadWbAccounts();
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = act === 'checkin' ? '签到'
        : (act === 'credits' ? '查额度' : (act === 'switch' ? '切换' : button.textContent));
    }
  }
});

function resetModelForm() {
  editingModelId = '';
  el.wbModelName.value = '';
  el.wbModelId.value = '';
  el.wbModelVendor.value = 'Custom';
  el.wbModelUrl.value = '';
  el.wbModelKey.value = '';
  el.wbModelToolCall.checked = false;
  el.wbModelImages.checked = false;
  el.wbModelReasoning.checked = false;
  el.wbModels.dataset.editing = '';
}

function fillModelForm(model) {
  editingModelId = model.id;
  el.wbModelName.value = model.name || '';
  el.wbModelId.value = model.id || '';
  el.wbModelVendor.value = model.vendor || 'Custom';
  el.wbModelUrl.value = model.url || '';
  el.wbModelKey.value = '';
  el.wbModelKey.placeholder = model.hasKey ? ('已保存 ' + model.apiKeyMasked + '，留空不修改') : '填写 API Key';
  el.wbModelToolCall.checked = !!model.supportsToolCall;
  el.wbModelImages.checked = !!model.supportsImages;
  el.wbModelReasoning.checked = !!model.supportsReasoning;
  el.wbModels.dataset.editing = model.id;
  el.wbModelName.focus();
}

function renderWbModels(models) {
  if (!models.length) {
    el.wbModels.innerHTML = '<p class="hint-block">还没有自定义模型。填写上方表单即可添加。</p>';
    return;
  }
  el.wbModels.innerHTML = models.map((model) => ''
    + '<div class="wb-item" data-id="' + esc(model.id) + '">'
    + '<div class="wb-item-avatar">' + esc((model.name || model.id).slice(0, 1).toUpperCase()) + '</div>'
    + '<div class="wb-item-body">'
    + '<div class="wb-item-title">' + esc(model.name || model.id)
    + (model.disabled ? ' <span class="wb-badge">已停用</span>' : '') + '</div>'
    + '<div class="wb-item-meta">' + esc(model.id) + ' · ' + esc(model.vendor || 'Custom') + ' · ' + esc(model.url) + '</div>'
    + '<div class="wb-item-meta">Key ' + esc(model.apiKeyMasked || '未设置')
    + (model.supportsToolCall ? ' · 工具调用' : '')
    + (model.supportsImages ? ' · 图片' : '')
    + (model.supportsReasoning ? ' · 推理' : '') + '</div>'
    + '</div>'
    + '<div class="wb-item-actions">'
    + '<button class="btn small" data-act="edit" type="button">编辑</button>'
    + '<button class="btn small" data-act="toggle" type="button">' + (model.disabled ? '启用' : '停用') + '</button>'
    + '<button class="btn small danger" data-act="delete" type="button">删除</button>'
    + '</div></div>').join('');
}

let wbModelsLoading = false;
async function loadWbModels() {
  if (wbModelsLoading) return;
  wbModelsLoading = true;
  try {
    const data = await api('/api/wb/models');
    renderWbModels(data.models || []);
    if (editingModelId && !(data.models || []).some(model => model.id === editingModelId)) resetModelForm();
  } finally {
    wbModelsLoading = false;
  }
}

el.wbModelSave.addEventListener('click', async () => {
  el.wbModelSave.disabled = true;
  try {
    const model = {
      originalId: editingModelId || undefined,
      id: el.wbModelId.value.trim(),
      name: el.wbModelName.value.trim(),
      vendor: el.wbModelVendor.value.trim(),
      url: el.wbModelUrl.value.trim(),
      apiKey: el.wbModelKey.value.trim(),
      supportsToolCall: el.wbModelToolCall.checked,
      supportsImages: el.wbModelImages.checked,
      supportsReasoning: el.wbModelReasoning.checked,
    };
    await api('/api/wb/models/save', model);
    toast(editingModelId ? '模型已更新' : '模型已添加');
    resetModelForm();
    await loadWbModels();
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.wbModelSave.disabled = false;
  }
});

el.wbModelReset.addEventListener('click', resetModelForm);

el.wbModels.addEventListener('click', async (ev) => {
  const button = ev.target.closest('button[data-act]');
  const item = ev.target.closest('.wb-item');
  if (!button || !item) return;
  const id = item.dataset.id;
  const act = button.getAttribute('data-act');
  try {
    if (act === 'edit') {
      const data = await api('/api/wb/models');
      const model = (data.models || []).find(row => row.id === id);
      if (model) fillModelForm(model);
      return;
    }
    if (act === 'toggle') {
      const enabling = button.textContent === '启用';
      await api('/api/wb/models/toggle', { id, enabled: enabling });
      toast(enabling ? '模型已启用' : '模型已停用');
      await loadWbModels();
      return;
    }
    if (act === 'delete') {
      const ok = await confirmSheet({
        icon: 'trash',
        danger: true,
        title: '删除这个模型？',
        message: '会从 models.json 中移除，操作前已自动备份原文件。',
        ok: '删除',
      });
      if (!ok) return;
      await api('/api/wb/models/delete', { id });
      toast('模型已删除');
      if (editingModelId === id) resetModelForm();
      await loadWbModels();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- WorkBuddy 会话 ----------
let wbSessionsData = { rows: [], labels: {}, accounts: [] };
let wbSessionsLoading = false;
let wbSessionTimer = 0;
let wbSessionsKey = '';
const wbSessionSelected = new Set();

function sessionStatusLabel(status) {
  const value = String(status || '').toLowerCase();
  const map = { working: '进行中', planning: '规划中', completed: '已完成', failed: '失败', canceled: '已取消', pending: '等待中' };
  return map[value] || status || '';
}

function tokenText(used) {
  const n = Number(used) || 0;
  if (!n) return '';
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M tokens';
  if (n >= 1000) return Math.round(n / 1000) + 'k tokens';
  return n + ' tokens';
}

function updateSessionSelectionUi() {
  const count = wbSessionSelected.size;
  el.wbSessionsExport.disabled = count === 0;
  el.wbSessionsExport.textContent = count ? '导出所选（' + count + '）' : '导出所选';
  el.wbSessionsSync.disabled = count === 0;
  el.wbSessionsSync.textContent = count ? '同步所选（' + count + '）' : '同步所选';
  const rows = wbSessionsData.rows || [];
  const all = rows.length > 0 && rows.every(row => wbSessionSelected.has(String(row.id)));
  el.wbSessionAll.checked = all;
  el.wbSessionAll.indeterminate = !all && rows.some(row => wbSessionSelected.has(String(row.id)));
}

function sessionAccountLabel(uid) {
  return (wbSessionsData.labels && wbSessionsData.labels[uid]) || shortUid(uid);
}

function renderSessionTargets(accounts) {
  const selected = el.wbSessionsTarget.value;
  el.wbSessionsTarget.innerHTML = '<option value="">目标账号：当前账号</option>'
    + (accounts || []).map((row) => '<option value="' + esc(row.uid) + '">'
      + esc(sessionAccountLabel(row.uid)) + '（' + row.count + '）</option>').join('');
  el.wbSessionsTarget.value = selected;
}

function currentSessionUid() {
  return (wbAccountsData.current && wbAccountsData.current.uid) || '';
}

function renderWbSessions() {
  const rows = wbSessionsData.rows || [];
  if (!rows.length) {
    el.wbSessions.innerHTML = '<p class="hint-block">没有匹配的会话。</p>';
    updateSessionSelectionUi();
    return;
  }
  el.wbSessions.innerHTML = rows.map((row) => {
    const deleted = !!row.deleted_at;
    const title = row.custom_title || row.title || '(未命名会话)';
    const account = wbSessionsData.labels[row.user_id] || shortUid(row.user_id);
    const status = sessionStatusLabel(row.status);
    const badges = [];
    if (deleted) badges.push('<span class="wb-badge warn">已删除</span>');
    if (/working|planning/i.test(String(row.status || ''))) badges.push('<span class="wb-badge">' + esc(status) + '</span>');
    const checked = wbSessionSelected.has(String(row.id));
    return ''
      + '<div class="wb-item" data-id="' + esc(row.id) + '" data-deleted="' + (deleted ? '1' : '') + '">'
      + '<label class="wb-row-check" title="选择用于批量导出"><input type="checkbox" data-pick="' + esc(row.id) + '"' + (checked ? ' checked' : '') + '></label>'
      + '<div class="wb-item-avatar">' + esc(String(title).slice(0, 1).toUpperCase()) + '</div>'
      + '<div class="wb-item-body">'
      + '<div class="wb-item-title">' + esc(title) + ' ' + badges.join('') + '</div>'
      + '<div class="wb-item-meta">' + esc(account)
      + (row.model ? ' · ' + esc(row.model) : '')
      + (status ? ' · ' + esc(status) : '')
      + ' · ' + esc(formatDay(row.last_activity_at || row.updated_at)) + '</div>'
      + '<div class="wb-item-meta wb-item-path">' + esc(row.cwd || '') + (tokenText(row.used) ? ' · ' + esc(tokenText(row.used)) : '') + '</div>'
      + '</div>'
      + '<div class="wb-item-actions">'
      + '<button class="btn small" data-act="export" type="button">导出</button>'
      + (deleted
        ? '<button class="btn small" data-act="restore" type="button">恢复</button>'
          + '<button class="btn small danger" data-act="hard" type="button">彻底删除</button>'
        : '<button class="btn small" data-act="rename" type="button">重命名</button>'
          + '<button class="btn small danger" data-act="delete" type="button">删除</button>')
      + '</div></div>';
  }).join('');
  updateSessionSelectionUi();
}

async function loadWbSessions(options = {}) {
  if (wbSessionsLoading) return;
  wbSessionsLoading = true;
  const scrollTop = el.content.scrollTop;
  if (!options.silent) el.wbSessions.innerHTML = '<p class="hint-block">正在读取会话库…</p>';
  try {
    const params = new URLSearchParams();
    if (el.wbSessionAccount.value) params.set('account', el.wbSessionAccount.value);
    if (el.wbSessionSearch.value.trim()) params.set('q', el.wbSessionSearch.value.trim());
    if (el.wbSessionDeleted.checked) params.set('deleted', '1');
    const data = await api('/api/wb/sessions?' + params.toString());
    wbSessionsData = { rows: data.rows || [], labels: data.labels || {}, accounts: data.accounts || [] };
    const visible = new Set(wbSessionsData.rows.map(row => String(row.id)));
    for (const id of [...wbSessionSelected]) {
      if (!visible.has(id)) wbSessionSelected.delete(id);
    }
    const selected = el.wbSessionAccount.value;
    el.wbSessionAccount.innerHTML = '<option value="">全部账号</option>' + (data.accounts || []).map((row) => {
      const label = (data.labels && data.labels[row.uid]) || shortUid(row.uid);
      return '<option value="' + esc(row.uid) + '">' + esc(label) + '（' + row.count + '）</option>';
    }).join('');
    el.wbSessionAccount.value = selected;
    renderSessionTargets(data.accounts);
    const key = JSON.stringify(wbSessionsData);
    if (key !== wbSessionsKey || !options.silent) {
      wbSessionsKey = key;
      renderWbSessions();
      el.content.scrollTop = scrollTop;
    }
    if (data.cached) {
      const at = data.cachedAt ? new Date(data.cachedAt) : new Date();
      el.wbSessionsSynced.textContent = '本地缓存 · ' + at.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      el.wbSessionsSynced.title = data.warning || '暂时读不到 WorkBuddy 会话库，显示本地缓存的会话数据';
    } else {
      el.wbSessionsSynced.textContent = '已同步 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      el.wbSessionsSynced.title = '';
    }
  } finally {
    wbSessionsLoading = false;
  }
}

// 会话面板打开期间自动同步，切换账号或聊天进行时无需手动刷新
setInterval(() => {
  if (currentPane !== 'sessions' || wbSessionsLoading) return;
  loadWbSessions({ silent: true }).catch(() => {});
}, 12000);

el.wbSessionSearch.addEventListener('input', () => {
  clearTimeout(wbSessionTimer);
  wbSessionTimer = setTimeout(() => loadWbSessions().catch(err => toast(err.message, true)), 300);
});
el.wbSessionAccount.addEventListener('change', () => loadWbSessions().catch(err => toast(err.message, true)));
el.wbSessionDeleted.addEventListener('change', () => loadWbSessions().catch(err => toast(err.message, true)));
el.wbSessionsRefresh.addEventListener('click', () => {
  loadWbSessions().then(() => toast('会话列表已刷新')).catch(err => toast(err.message, true));
});

el.wbSessionAll.addEventListener('change', () => {
  wbSessionSelected.clear();
  if (el.wbSessionAll.checked) {
    for (const row of wbSessionsData.rows || []) wbSessionSelected.add(String(row.id));
  }
  renderWbSessions();
});

el.wbSessions.addEventListener('change', (ev) => {
  const pick = ev.target.closest('input[data-pick]');
  if (!pick) return;
  if (pick.checked) wbSessionSelected.add(String(pick.dataset.pick));
  else wbSessionSelected.delete(String(pick.dataset.pick));
  updateSessionSelectionUi();
});

async function exportSelectedSessions() {
  const ids = [...wbSessionSelected];
  if (!ids.length) return;
  const previous = el.wbSessionsExport.textContent;
  el.wbSessionsExport.disabled = true;
  el.wbSessionsExport.textContent = '导出中…';
  try {
    const response = await fetch('/api/wb/sessions/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) {
      let message = '导出失败';
      try { message = (await response.json()).error || message; } catch (_) {}
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename="([^"]+)"/.exec(disposition);
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = match ? match[1] : ('sessions-' + ids.length + '.json');
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
    toast('已导出 ' + ids.length + ' 个会话');
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.wbSessionsExport.textContent = previous;
    updateSessionSelectionUi();
  }
}

el.wbSessionsExport.addEventListener('click', exportSelectedSessions);

async function syncSelectedSessions() {
  const ids = [...wbSessionSelected];
  if (!ids.length) return;
  const to = el.wbSessionsTarget.value;
  if (!to) {
    toast('请先在「目标账号」里选择要同步到的账号', true);
    return;
  }
  const label = sessionAccountLabel(to);
  const ok = await confirmSheet({
    icon: 'info',
    title: '同步 ' + ids.length + ' 个会话？',
    message: '会话记录、消息文件和附件会复制到「' + label + '」，已存在的相同会话自动跳过。原账号的会话不受影响。',
    ok: '开始同步',
  });
  if (!ok) return;
  const previous = el.wbSessionsSync.textContent;
  el.wbSessionsSync.disabled = true;
  el.wbSessionsSync.textContent = '同步中…';
  try {
    const data = await api('/api/wb/sessions/sync', { to, ids });
    const parts = ['已同步 ' + (data.copied || []).length + ' 个会话'];
    if ((data.skipped || []).length) parts.push('跳过 ' + data.skipped.length + ' 个');
    if ((data.errors || []).length) parts.push('失败 ' + data.errors.length + ' 个');
    toast(parts.join('，'), (data.errors || []).length > 0);
    await loadWbSessions();
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.wbSessionsSync.textContent = previous;
    updateSessionSelectionUi();
  }
}

el.wbSessionsSync.addEventListener('click', syncSelectedSessions);

el.wbSessionsImport.addEventListener('click', () => el.wbSessionsImportFile.click());

el.wbSessionsImportFile.addEventListener('change', async () => {
  const file = el.wbSessionsImportFile.files && el.wbSessionsImportFile.files[0];
  el.wbSessionsImportFile.value = '';
  if (!file) return;
  const to = el.wbSessionsTarget.value || currentSessionUid();
  if (!to) {
    toast('没有可导入的目标账号，请先在 WorkBuddy 登录', true);
    return;
  }
  const previous = el.wbSessionsImport.textContent;
  el.wbSessionsImport.disabled = true;
  el.wbSessionsImport.textContent = '读取中…';
  try {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (_) { throw new Error('不是有效的会话导出文件'); }
    const bundles = Array.isArray(data.sessions)
      ? data.sessions
      : (Array.isArray(data.bundles) ? data.bundles : (data.session ? [data] : []));
    if (!bundles.length) throw new Error('文件里没有会话数据');
    const ok = await confirmSheet({
      icon: 'info',
      title: '导入 ' + bundles.length + ' 个会话？',
      message: '会话记录与消息文件会导入到「' + sessionAccountLabel(to)
        + '」，已存在的相同会话自动跳过。',
      ok: '导入',
    });
    if (!ok) return;
    el.wbSessionsImport.textContent = '导入中…';
    const result = await api('/api/wb/sessions/import', { uid: to, sessions: bundles });
    const parts = ['已导入 ' + (result.imported || []).length + ' 个会话'];
    if ((result.duplicates || []).length) parts.push('跳过 ' + result.duplicates.length + ' 个重复会话');
    if ((result.errors || []).length) parts.push('失败 ' + result.errors.length + ' 个');
    toast(parts.join('，'), (result.errors || []).length > 0);
    await loadWbSessions();
  } catch (err) {
    toast(err.message, true);
  } finally {
    el.wbSessionsImport.disabled = false;
    el.wbSessionsImport.textContent = previous;
  }
});

el.wbSessions.addEventListener('click', async (ev) => {
  const button = ev.target.closest('button[data-act]');
  const item = ev.target.closest('.wb-item');
  if (!button || !item) return;
  const id = item.dataset.id;
  const act = button.getAttribute('data-act');
  try {
    if (act === 'export') {
      const link = document.createElement('a');
      link.href = '/api/wb/sessions/export?id=' + encodeURIComponent(id);
      link.download = '';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast('正在导出会话');
      return;
    }
    if (act === 'rename') {
      const title = item.querySelector('.wb-item-title').textContent.trim();
      const next = await confirmSheet({
        title: '重命名会话',
        message: '只修改 WorkBuddy 侧栏显示的自定义标题。',
        icon: 'info',
        input: true,
        value: title,
        placeholder: '输入新标题',
        ok: '保存',
      });
      if (!next) return;
      await api('/api/wb/sessions/rename', { id, title: next });
      toast('已重命名');
      await loadWbSessions();
      return;
    }
    if (act === 'delete') {
      const ok = await confirmSheet({
        icon: 'trash',
        danger: true,
        title: '删除这个会话？',
        message: '会话会从 WorkBuddy 侧栏移除，可在「显示已删除」里恢复。',
        ok: '删除',
      });
      if (!ok) return;
      await api('/api/wb/sessions/delete', { ids: [id] });
      toast('会话已移到回收站');
      await loadWbSessions();
      return;
    }
    if (act === 'restore') {
      await api('/api/wb/sessions/restore', { ids: [id] });
      toast('会话已恢复');
      await loadWbSessions();
      return;
    }
    if (act === 'hard') {
      const ok = await confirmSheet({
        icon: 'trash',
        danger: true,
        title: '彻底删除会话？',
        message: '数据库记录和本地会话文件都会被删除，无法恢复。',
        ok: '彻底删除',
      });
      if (!ok) return;
      const data = await api('/api/wb/sessions/delete', { ids: [id], hard: true });
      toast('已彻底删除（文件 ' + (data.files || 0) + ' 个）');
      await loadWbSessions();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- WorkBuddy 增强 ----------
let wbEnhanceState = { dnd: false, autoContinue: false };
let wbEnhanceLoading = false;

async function loadWbEnhance() {
  if (wbEnhanceLoading) return;
  wbEnhanceLoading = true;
  try {
    const data = await api('/api/wb/enhance');
    wbEnhanceState = data.enhance || { dnd: false, autoContinue: false };
    el.wbEnhanceDnd.checked = !!wbEnhanceState.dnd;
    el.wbEnhanceAuto.checked = !!wbEnhanceState.autoContinue;
  } finally {
    wbEnhanceLoading = false;
  }
}

async function saveEnhance(patch) {
  const data = await api('/api/wb/enhance', patch);
  wbEnhanceState = data.enhance || wbEnhanceState;
  return wbEnhanceState;
}

el.wbEnhanceDnd.addEventListener('change', () => {
  saveEnhance({ dnd: el.wbEnhanceDnd.checked })
    .then(state => toast(state.dnd ? '免打扰已开启' : '免打扰已关闭'))
    .catch(err => { el.wbEnhanceDnd.checked = !el.wbEnhanceDnd.checked; toast(err.message, true); });
});

el.wbEnhanceAuto.addEventListener('change', () => {
  saveEnhance({ autoContinue: el.wbEnhanceAuto.checked })
    .then(state => toast(state.autoContinue ? '自动继续已开启' : '自动继续已关闭'))
    .catch(err => { el.wbEnhanceAuto.checked = !el.wbEnhanceAuto.checked; toast(err.message, true); });
});

// ---------- 电脑电源 ----------
let wbPowerApplying = false;

function renderWbPower(power) {
  el.wbPowerMode.value = power.mode || 'allow';
  el.wbPowerDisplay.checked = !!power.displaySleep;
  const labels = { allow: '允许电脑休眠', keep: '保持唤醒', 'until-done': '任务结束后自动解除' };
  el.wbPowerState.textContent = (labels[power.mode] || power.mode)
    + (power.preventing && !power.active ? ' · 后台进程未就绪' : '')
    + (power.mode === 'until-done' ? ' · 每 60 秒检查任务状态' : '');
}

async function loadWbPower() {
  const data = await api('/api/wb/power');
  renderWbPower(data.power || {});
}

async function applyPower() {
  if (wbPowerApplying) return;
  wbPowerApplying = true;
  el.wbPowerMode.disabled = true;
  try {
    const data = await api('/api/wb/power', {
      mode: el.wbPowerMode.value,
      displaySleep: el.wbPowerDisplay.checked,
    });
    renderWbPower(data.power || {});
    toast(data.power && data.power.preventing ? '已保持电脑唤醒' : '已允许电脑休眠');
  } catch (err) {
    toast(err.message, true);
    await loadWbPower().catch(() => {});
  } finally {
    el.wbPowerMode.disabled = false;
    wbPowerApplying = false;
  }
}

el.wbPowerMode.addEventListener('change', applyPower);
el.wbPowerDisplay.addEventListener('change', applyPower);

el.wbPowerSleep.addEventListener('click', async () => {
  const ok = await confirmSheet({
    icon: 'info',
    title: '立即让电脑休眠？',
    message: '当前会话会短暂中断，请先保存正在编辑的内容。',
    ok: '休眠',
  });
  if (!ok) return;
  try {
    await api('/api/wb/power/sleep', {});
    toast('已请求电脑休眠');
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- 关于 ----------
let wbAboutLoading = false;
let wbUpdateInfo = null;
let wbUpdateChecking = false;
let wbUpdatePolling = false;

function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (!n) return '';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function formatNotes(body) {
  const raw = String(body || '').trim();
  if (!raw) return '';
  return esc(raw).split(/\r?\n/).map((line) => {
    let out = line
      .replace(/^#{1,3}\s+(.*)$/, '<b>$1</b>')
      .replace(/^\s*[-*]\s+/, '• ')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    return out;
  }).join('\n');
}

function renderUpdateInfo(info) {
  wbUpdateInfo = info;
  el.wbUpdateNotes.hidden = true;
  el.wbUpdateDownload.hidden = true;
  el.wbUpdateDownload.disabled = false;
  el.wbUpdateInstall.hidden = true;
  el.wbUpdateInstall.disabled = false;
  const notes = formatNotes(info.notes);
  if (info.hasUpdate) {
    const when = info.publishedAt ? new Date(info.publishedAt) : null;
    el.wbUpdateStatus.textContent = '发现新版本 ' + info.latest + '（当前 ' + info.current + '）'
      + (when && !isNaN(when) ? ' · 发布于 ' + when.toLocaleDateString('zh-CN') : '');
    if (notes) {
      el.wbUpdateNotes.innerHTML = '<span class="about-tag">' + esc(info.name || ('v' + info.latest)) + '</span>\n'
        + notes;
      el.wbUpdateNotes.hidden = false;
    }
    if (info.download) {
      el.wbUpdateDownload.textContent = '下载更新' + (info.download.size
        ? '（' + fmtBytes(info.download.size) + '）' : '');
      el.wbUpdateDownload.hidden = false;
    } else {
      el.wbUpdateStatus.textContent += '（该版本没有可下载的安装包）';
    }
  } else {
    el.wbUpdateStatus.textContent = info.latest && info.latest !== info.current
      ? '当前版本 ' + info.current + '，GitHub 上的最新发布为 ' + info.latest + '。'
      : '当前已是最新版本 ' + info.current + '。';
    if (notes) {
      el.wbUpdateNotes.innerHTML = '<span class="about-tag">' + esc(info.name || ('v' + info.latest)) + '</span>\n'
        + notes;
      el.wbUpdateNotes.hidden = false;
    }
  }
}

function renderUpdateDownload(d) {
  if (!d) return;
  if (d.state === 'downloading') {
    const total = Number(d.total) || 0;
    const pct = total ? Math.min(100, Math.round((Number(d.received) || 0) / total * 100)) : 0;
    el.wbUpdateStatus.textContent = total
      ? '正在下载更新 ' + pct + '%（' + fmtBytes(d.received) + ' / ' + fmtBytes(total) + '）…'
      : '正在下载更新 ' + fmtBytes(d.received) + '…';
    el.wbUpdateDownload.hidden = true;
    el.wbUpdateInstall.hidden = true;
  } else if (d.state === 'done') {
    el.wbUpdateStatus.textContent = '更新已下载并通过校验：' + (d.name || '安装包')
      + '。运行安装程序会先退出 workbuddyEVA，安装完成后自动重新启动。';
    el.wbUpdateDownload.hidden = true;
    el.wbUpdateDownload.disabled = false;
    el.wbUpdateInstall.hidden = false;
    el.wbUpdateInstall.disabled = false;
  } else if (d.state === 'error') {
    el.wbUpdateStatus.textContent = '下载失败：' + (d.error || '未知错误');
    el.wbUpdateDownload.hidden = false;
    el.wbUpdateDownload.disabled = false;
    el.wbUpdateInstall.hidden = true;
  }
}

async function pollUpdateDownload() {
  if (wbUpdatePolling) return;
  wbUpdatePolling = true;
  const tick = async () => {
    let d = null;
    try { d = (await api('/api/update/download')).download; } catch (_) {
      wbUpdatePolling = false;
      return;
    }
    renderUpdateDownload(d);
    if (d && d.state === 'downloading') setTimeout(tick, 700);
    else wbUpdatePolling = false;
  };
  tick();
}

async function checkWbUpdate(force) {
  if (wbUpdateChecking) return;
  wbUpdateChecking = true;
  wbUpdateInfo = null;
  el.wbUpdateCheck.disabled = true;
  el.wbUpdateStatus.textContent = '正在检查 GitHub 上的最新版本…';
  el.wbUpdateNotes.hidden = true;
  el.wbUpdateDownload.hidden = true;
  el.wbUpdateInstall.hidden = true;
  try {
    renderUpdateInfo(await api('/api/update' + (force ? '?force=1' : '')));
  } catch (err) {
    el.wbUpdateStatus.textContent = '检查更新失败：' + err.message;
  } finally {
    wbUpdateChecking = false;
    el.wbUpdateCheck.disabled = false;
  }
}

async function loadWbAbout() {
  if (wbAboutLoading) return;
  wbAboutLoading = true;
  try {
    const data = await api('/api/about');
    const started = new Date(Number(data.startedAt) || Date.now());
    el.wbAboutMeta.innerHTML = esc(data.name || 'workbuddyEVA')
      + ' · 版本 ' + esc(data.version || '—')
      + ' · 本次启动 ' + esc(started.toLocaleString('zh-CN'))
      + '<br>数据目录：' + esc(data.dataDir || '—');
  } catch (err) {
    el.wbAboutMeta.textContent = err.message;
  } finally {
    wbAboutLoading = false;
  }
  checkWbUpdate(false);
}

el.wbUpdateCheck.addEventListener('click', () => checkWbUpdate(true));

el.wbUpdateDownload.addEventListener('click', async () => {
  if (!wbUpdateInfo || !wbUpdateInfo.hasUpdate) return;
  const size = wbUpdateInfo.download && wbUpdateInfo.download.size
    ? '（约 ' + fmtBytes(wbUpdateInfo.download.size) + '）' : '';
  const ok = await confirmSheet({
    title: '下载更新',
    message: '将从 GitHub 下载 workbuddyEVA ' + wbUpdateInfo.latest + ' 的安装包' + size
      + '，保存到数据目录下的 updates 文件夹。下载完成后由你决定是否安装。现在开始下载吗？',
    icon: 'restart',
  });
  if (!ok) return;
  el.wbUpdateDownload.disabled = true;
  el.wbUpdateStatus.textContent = '正在连接 GitHub 下载更新…';
  try {
    const data = await api('/api/update/download', {});
    renderUpdateDownload(data.download);
    pollUpdateDownload();
  } catch (err) {
    el.wbUpdateStatus.textContent = '下载失败：' + err.message;
    el.wbUpdateDownload.disabled = false;
  }
});

el.wbUpdateInstall.addEventListener('click', async () => {
  const ok = await confirmSheet({
    title: '安装更新',
    message: '安装程序会先退出 workbuddyEVA，把程序更新为新版本后自动重新启动；壁纸配置与账号数据会保留。现在运行安装程序吗？',
    icon: 'restart',
  });
  if (!ok) return;
  el.wbUpdateInstall.disabled = true;
  try {
    await api('/api/update/install', {});
    toast('安装程序已启动，请按提示完成更新');
  } catch (err) {
    el.wbUpdateInstall.disabled = false;
    toast(err.message, true);
  }
});

// ---------- 对话框 / 快捷键 ----------
el.sheetOk.addEventListener('click', () => {
  closeSheet(el.sheetInput.hidden ? true : el.sheetInput.value.trim());
});
el.sheetCancel.addEventListener('click', () => closeSheet(false));
el.sheetInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    closeSheet(el.sheetInput.value.trim());
  }
});
el.sheet.addEventListener('click', ev => { if (ev.target === el.sheet) closeSheet(false); });

document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && !el.sheet.hidden) {
    ev.preventDefault();
    closeSheet(false);
    return;
  }
  if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'f' || ev.key === 'F')) {
    ev.preventDefault();
    if (currentPane !== 'library') showPane('library');
    el.search.focus();
    el.search.select();
    return;
  }
  if (ev.key === 'Escape' && document.activeElement === el.search && el.search.value) {
    el.search.value = '';
    keyword = '';
    renderGrid();
    return;
  }
  if (ev.key === 'Escape' && EMBED) {
    postToParent('close-panel');
  }
});

showPane('accounts');
load();
setInterval(() => {
  // 只在壁纸库前台时轮询完整状态，避免后台反复扫描壁纸目录、重绘卡片
  if (currentPane === 'library') load();
}, 4000);
