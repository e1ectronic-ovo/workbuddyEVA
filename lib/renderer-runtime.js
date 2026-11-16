'use strict';

// WorkBuddy 壁纸渲染层运行时：由 CDP 注入到 WorkBuddy 渲染进程。
// 修改本文件后需要同步提升 api.version 与 lib/inject.js 的 VERSION，
// 然后运行 node tools/build-runtime-source.js 重新生成打包用的 runtime-source.js。

function wbweInit(initial) {
  var LAYER_ID = 'wbwe-layer';
  var STYLE_ID = 'wbwe-style';
  var BAR_ID = 'wbwe-bar';
  var NOTICE_ID = 'wbwe-notice';
  var PANEL_ID = 'wbwe-panel';

  if (window.__wbwe && window.__wbwe.apply) {
    window.__wbwe.apply(initial);
    return 'updated';
  }
  if (window.__wbweDispose) {
    try { window.__wbweDispose(); } catch (_) {}
  }

  var layerEl = null;
  var holder = null;
  var maskEl = null;
  var barEl = null;
  var barBrand = null;
  var media = null;
  var current = { id: '', url: '' };
  var visibilityHandler = null;
  var mountSeq = 0;
  var blobUrl = '';
  var noticeTimer = 0;
  var lastNotice = '';
  var lastState = null;

  // Scene：iframe 内跑 WebWallGL 实时渲染，指针通过 postMessage 转发（pushPointer）
  var sceneFrame = null;
  var sceneFailed = false;
  var scenePaused = false;
  var sceneReady = false;
  var sceneStage = '';
  var sceneTimer = 0;
  var sceneMsgHandler = null;
  var webFrame = null;
  var pointerHandler = null;
  var pointerRaf = 0;
  var pointerQueued = null;
  var lastPointer = { u: -1, v: -1, b: -1 };
  var panelEl = null;
  var panelFrame = null;
  var escHandler = null;
  var panelMsgHandler = null;
  var evictTimer = 0;
  var repairObserver = null;
  var repairTimer = 0;
  var guardTimer = 0;
  var dndSnapshot = null;
  var autoContinueObserver = null;
  var autoContinueTimer = 0;
  var lastContinueAt = new WeakMap();

  var CSS = [
    // 自带深色底：WorkDaddy 关掉 / 没再注入主题时也不会露出白底把界面弄花
    'html[data-wbwe="1"]{background-color:#08080a !important;}',
    'html[data-wbwe="1"] body,html[data-wbwe="1"] body[data-vscode-theme-name]{background:transparent !important;background-image:none !important;}',
    'html[data-wbwe="1"] body #root{background:transparent !important;background-image:none !important;position:relative;z-index:2;}',
    // 刷新/切账号后 WorkBuddy 会给这些整屏布局壳重新刷上不透明底色，必须一并清掉
    'html[data-wbwe="1"] body .wb-home-route,html[data-wbwe="1"] body .wb-homepage,'
      + 'html[data-wbwe="1"] body .detail-new-tab-landing,'
      + 'html[data-wbwe="1"] body .teams-container,html[data-wbwe="1"] body .teams-grid-scroll-content,'
      + 'html[data-wbwe="1"] body .teams-grid-scroll-content > [class*="_grid_"],'
      + 'html[data-wbwe="1"] body .teams-grid-scroll-content [class*="_gridView_"],'
      + 'html[data-wbwe="1"] body .teams-grid-scroll-content [class*="_gridViewItem_"],'
      + 'html[data-wbwe="1"] body .conversation-shell,html[data-wbwe="1"] body .conversation-shell__main{'
      + 'background:transparent !important;background-color:transparent !important;background-image:none !important;}',
    'html[data-wbwe="1"] body > *:not(#wbwe-layer){z-index:2;}',
    '#' + LAYER_ID + '{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#050506;}',
    '#wbwe-holder{position:absolute;inset:0;opacity:1;transition:opacity .4s ease;will-change:opacity;}',
    '#wbwe-holder video,#wbwe-holder img,#wbwe-holder iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent;}',
    '#wbwe-mask{position:absolute;inset:0;}',
    // ---- 性能模式：层内不重排、不重复合成；全局关掉液态玻璃的 backdrop-filter ----
    'html[data-wbwe-perf="1"] body *:not(#wbwe-bar):not(.conversation-list){backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
    'html[data-wbwe-perf="1"] #wbwe-layer{contain:strict;transform:translateZ(0);will-change:transform;}',
    'html[data-wbwe-perf="1"] #wbwe-holder video{transform:translateZ(0);}',
    // ---- 宿主工具条 ----
    'html[data-wbwe="1"] body > #' + BAR_ID + '{z-index:2147483000 !important;}',
    'html[data-wbwe="1"] body > #' + NOTICE_ID + '{z-index:2147483001 !important;}',
    'html[data-wbwe="1"] body > #' + PANEL_ID + '{z-index:2147483002 !important;}',
    '#' + BAR_ID + '{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:12px;background:transparent;line-height:0;'
      + 'opacity:1;pointer-events:auto;z-index:2147483000;user-select:none;}',
    '#' + BAR_ID + ' .wbwe-brand{width:44px;height:44px;padding:0;border:0;border-radius:12px;background:#140a10;cursor:pointer;overflow:hidden;'
      + 'box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 0 1px rgba(255,104,94,.35),0 0 18px rgba(232,16,42,.18);'
      + 'transition:box-shadow .16s ease,transform .16s ease;}',
    '#' + BAR_ID + ' .wbwe-brand img{width:100%;height:100%;display:block;object-fit:cover;}',
    '#' + BAR_ID + ' .wbwe-brand:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(0,0,0,.55),0 0 0 1px rgba(255,150,120,.75),0 0 24px rgba(232,16,42,.42);}',
    '#' + BAR_ID + ' .wbwe-brand:active{transform:scale(.96);}',
    // ---- 宿主内提示 ----
    '#' + NOTICE_ID + '{position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-8px);padding:9px 15px;border-radius:10px;'
      + 'background:rgba(30,12,20,.86);border:1px solid rgba(255,104,94,.2);color:#f9eef1;'
      + 'font:12.5px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;max-width:72vw;text-align:center;'
      + 'opacity:0;pointer-events:none;transition:opacity .22s ease,transform .22s ease;z-index:2147483001;'
      + 'box-shadow:0 10px 28px rgba(0,0,0,.34);backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);}',
    '#' + NOTICE_ID + '.up{opacity:1;transform:translateX(-50%) translateY(0);}',
    // ---- 宿主内控制面板（iframe 浮层，等同 dsh 的属性页） ----
    '#' + PANEL_ID + '{position:fixed;inset:0;display:none;align-items:center;justify-content:center;'
      + 'background:rgba(0,0,0,.42);backdrop-filter:blur(10px) saturate(.9);-webkit-backdrop-filter:blur(10px) saturate(.9);z-index:2147483002;}',
    '#' + PANEL_ID + '.up{display:flex;}',
    '#' + PANEL_ID + ' .wbwe-panel-box{position:relative;width:min(1180px,93vw);height:min(840px,91vh);border-radius:12px;overflow:hidden;'
      + 'border:1px solid rgba(255,104,94,.24);box-shadow:0 40px 120px rgba(0,0,0,.6),0 0 50px rgba(232,16,42,.14),0 0 0 .5px rgba(255,255,255,.06);background:#120810;'
      + 'animation:wbwePanelIn .2s cubic-bezier(.25,.8,.4,1);}',
    '@keyframes wbwePanelIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}',
    '#' + PANEL_ID + ' iframe{width:100%;height:100%;border:0;display:block;background:#120810;}',
    'html[data-wbwe-glass="1"] body .teams-container,html[data-wbwe-glass="1"] body .teams-container.is-mac{background:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
    'html[data-wbwe-glass="1"] body [data-view-id]{background:transparent !important;}',
    'html[data-wbwe-glass="1"] body .main-content{background:transparent !important;}',
    // ---- 左侧栏：透明磨砂玻璃（低不透明度 + 高模糊，壁纸颜色能透上来） ----
    'html[data-wbwe-glass="1"] body .conversation-sidebar{background:transparent !important;border-right:0 !important;box-shadow:none !important;}',
    'html[data-wbwe-glass="1"] body .conversation-list{'
      + 'background:linear-gradient(180deg,rgba(255,255,255,.10),rgba(255,255,255,.025) 38%,rgba(255,255,255,.055)),'
      + 'color-mix(in srgb,var(--wb-bg-primary,#0b0b0d) 30%,transparent) !important;'
      + 'backdrop-filter:blur(40px) saturate(1.8) !important;-webkit-backdrop-filter:blur(40px) saturate(1.8) !important;'
      + 'border-right:0 !important;'
      + 'border-radius:12px !important;'
      + 'box-shadow:inset -1px 0 0 rgba(255,255,255,.035),inset 0 1px 0 rgba(255,255,255,.04) !important;}',
    // 其它左右侧栏同样去硬边
    'html[data-wbwe-glass="1"] body [class*="sidebar"],html[data-wbwe-glass="1"] body [class*="side-panel"],html[data-wbwe-glass="1"] body [class*="right-panel"]{'
      + 'border-right-color:transparent !important;border-left-color:transparent !important;box-shadow:none !important;}',
    // ---- 顶层：让壁纸层压过宿主/第三方的壁纸底色与覆盖层 ----
    'html[data-wbwe="1"],html[data-wbwe="1"] body{background-image:none !important;}',
    'html[data-wbwe="1"] [data-wbwe-evicted="1"]{display:none !important;}',
    // ---- 顶部：标题栏去底色、系统菜单栏也交给壁纸铺满 ----
    'html[data-wbwe-glass="1"] body .workbuddy-topbar{background:transparent !important;backdrop-filter:none !important;-webkit-backdrop-filter:none !important;}',
    'html[data-wbwe-glass="1"] body #workbuddy-menubar-container,html[data-wbwe-glass="1"] body .workbuddy-window-controls{background:transparent !important;}',
    'html[data-wbwe-glass="1"] body [class*="chat-input"]{background:color-mix(in srgb,var(--wb-bg-primary,#111113) 40%,transparent) !important;backdrop-filter:blur(20px) saturate(1.15);-webkit-backdrop-filter:blur(20px) saturate(1.15);}',
    'html[data-wbwe-glass="1"] body [data-view-id="main-content"]{background:linear-gradient(180deg,transparent 0 38%,color-mix(in srgb,var(--wb-bg-primary,#111113) 55%,transparent) 100%) !important;}',
  ].join('\n');

  function ensureStyle() {
    var head = document.head || document.documentElement;
    var el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      head.appendChild(el);
    }
    if (el.textContent !== CSS) el.textContent = CSS;
    // 主题会在刷新后往后追加样式；把自己的样式一直压到 head 末尾，同级规则才能稳定生效
    if (el.parentElement !== head || head.lastElementChild !== el) head.appendChild(el);
  }

  function ensureLayer() {
    layerEl = document.getElementById(LAYER_ID);
    if (!layerEl) {
      layerEl = document.createElement('div');
      layerEl.id = LAYER_ID;
      maskEl = document.createElement('div');
      maskEl.id = 'wbwe-mask';
      holder = document.createElement('div');
      holder.id = 'wbwe-holder';
      layerEl.appendChild(holder);
      layerEl.appendChild(maskEl);
      (document.body || document.documentElement).appendChild(layerEl);
    } else {
      holder = layerEl.querySelector('#wbwe-holder') || layerEl;
      maskEl = layerEl.querySelector('#wbwe-mask');
    }
  }

  function ensureAttrs() {
    if (!lastState) return;
    document.documentElement.setAttribute('data-wbwe', '1');
    if (lastState.glass) document.documentElement.setAttribute('data-wbwe-glass', '1');
    else document.documentElement.removeAttribute('data-wbwe-glass');
    if (lastState.perf) document.documentElement.setAttribute('data-wbwe-perf', '1');
    else document.documentElement.removeAttribute('data-wbwe-perf');
    if (api.id) document.documentElement.setAttribute('data-wbwe-id', api.id);
  }

  // 只清“整屏布局壳”的背景，不动应用内部卡片/弹层
  function clearShellBackground(el) {
    if (!el || !el.style) return;
    el.style.setProperty('background-color', 'transparent', 'important');
    el.style.setProperty('background-image', 'none', 'important');
  }

  function enforceBackdrop() {
    if (!lastState) return;
    document.documentElement.style.setProperty('background-color', '#08080a', 'important');
    document.documentElement.style.setProperty('background-image', 'none', 'important');
    clearShellBackground(document.body);
    clearShellBackground(document.getElementById('root'));

    var shell = document.querySelectorAll(
      '.wb-home-route,.wb-homepage,.detail-new-tab-landing,'
      + '.teams-container,.teams-grid-scroll-content,'
      + '.teams-grid-scroll-content > [class*="_grid_"],'
      + '.teams-grid-scroll-content [class*="_gridView_"],'
      + '.teams-grid-scroll-content [class*="_gridViewItem_"],'
      + '.conversation-shell,.conversation-shell__main',
    );
    for (var i = 0; i < shell.length; i++) clearShellBackground(shell[i]);

    // 壁纸层不能被宿主换壳时挪走或压到别的层级
    if (layerEl && document.body && layerEl.parentElement !== document.body) {
      document.body.appendChild(layerEl);
    }
    if (layerEl) layerEl.style.setProperty('z-index', '0', 'important');
  }

  function repairNow() {
    if (!lastState) return;
    var existed = !!document.getElementById(LAYER_ID);
    ensureStyle();
    ensureAttrs();
    ensureLayer();
    if (!existed) {
      current = { id: '', url: '' };
      mount(lastState);
    }
    enforceBackdrop();
  }

  function scheduleRepair(delay) {
    clearTimeout(repairTimer);
    repairTimer = setTimeout(repairNow, delay || 120);
  }

  function startGuards() {
    if (!repairObserver) {
      repairObserver = new MutationObserver(function () { scheduleRepair(120); });
      repairObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-wbs-theme', 'data-wbs-theme-id'],
      });
      if (document.body) {
        repairObserver.observe(document.body, {
          attributes: true,
          attributeFilter: ['class', 'data-vscode-theme-name', 'data-theme-source'],
        });
      }
      repairObserver.observe(document.head || document.documentElement, { childList: true });
    }
    if (!guardTimer) {
      // 兜底：账号切换/主题重注入不一定会触发 head 变化
      guardTimer = setInterval(repairNow, 2000);
    }
  }

  // 宿主里可能同时有 WorkDaddy / 主题自带的全屏壁纸覆盖层：把整屏 canvas/video
  // 或已知壁纸容器标成 evicted，由 CSS display:none 挤掉，保证我们的壁纸在上层可见。
  function evictOverlays() {
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var media = document.querySelectorAll('canvas, video');
    for (var i = 0; i < media.length; i++) {
      var m = media[i];
      if (m.closest('#' + LAYER_ID) || m.closest('#' + PANEL_ID)) continue;
      var r = m.getBoundingClientRect();
      if (r.width < vw * 0.85 || r.height < vh * 0.85) continue;
      var host = m;
      for (var d = 0; d < 6; d++) {
        var node = host.parentElement;
        if (!node || node === document.body) break;
        var nr = node.getBoundingClientRect();
        if (nr.width < vw * 0.85 || nr.height < vh * 0.85) break;
        var ncs = getComputedStyle(node);
        if (ncs.position !== 'fixed' && ncs.position !== 'absolute') break;
        host = node;
      }
      if (host.closest('#' + LAYER_ID)) continue;
      host.setAttribute('data-wbwe-evicted', '1');
    }
    var known = document.querySelectorAll('[data-wd-wallpaper],[data-workdaddy-wallpaper],[data-wallpaper-layer],'
      + '#wd-wallpaper,#workdaddy-wallpaper,#dsh-wallpaper,.wd-wallpaper,.workdaddy-wallpaper,.dsh-wallpaper');
    for (var j = 0; j < known.length; j++) {
      var k = known[j];
      if (k.closest('#' + LAYER_ID)) continue;
      var kr = k.getBoundingClientRect();
      if (kr.width < vw * 0.5 || kr.height < vh * 0.5) continue;
      k.setAttribute('data-wbwe-evicted', '1');
    }
  }

  function syncBar() {
    var st = lastState;
    if (!barEl || !st || !barBrand) return;
    var src = String(st.apiBase || '') + '/assets/brand/app.png';
    if (barBrand.getAttribute('src') !== src) barBrand.setAttribute('src', src);
  }

  function ensureBar() {
    if (!barEl) {
      barEl = document.createElement('div');
      barEl.id = BAR_ID;
      barEl.innerHTML = '<button data-act="panel" class="wbwe-brand" title="打开壁纸控制面板" aria-label="打开壁纸控制面板"><img alt=""></button>';
      barBrand = barEl.querySelector('.wbwe-brand img');
      barEl.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openPanel();
      });
      (document.body || document.documentElement).appendChild(barEl);
    } else if (!barEl.isConnected) {
      (document.body || document.documentElement).appendChild(barEl);
    }
    syncBar();
  }

  function showNotice(text) {
    if (!text || text === lastNotice) return;
    lastNotice = text;
    var el = document.getElementById(NOTICE_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = NOTICE_ID;
      (document.body || document.documentElement).appendChild(el);
    }
    el.textContent = text;
    el.classList.add('up');
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(function () { el.classList.remove('up'); }, 4200);
  }

  function fitOf(state) {
    return state.fit === 'contain' ? 'contain' : state.fit === 'stretch' ? 'fill' : 'cover';
  }

  // WebWallGL 的 fit 取值是 cover / contain / stretch（不是 CSS 的 fill）
  function sceneFitOf(state) {
    return state.fit === 'contain' ? 'contain' : state.fit === 'stretch' ? 'stretch' : 'cover';
  }

  // ---------- Scene（WebWallGL iframe） ----------
  function sceneAlive() {
    return !!sceneFrame && !sceneFailed;
  }

  function sceneCmd(name, args) {
    if (!sceneFrame || !sceneFrame.contentWindow) return;
    try { sceneFrame.contentWindow.postMessage({ __wbwe: 1, method: name, args: args || [] }, '*'); } catch (_) {}
  }

  function sceneSync(state) {
    if (!sceneAlive() || !state) return;
    sceneCmd('setFit', [sceneFitOf(state)]);
    sceneCmd('setFps', [Number(state.sceneFps) || 60]);
    sceneCmd('setVolume', [state.audio ? 1 : 0]);
  }

  function pointerSend(u, v, buttons) {
    if (sceneAlive()) {
      if (lastPointer.u === u && lastPointer.v === v && lastPointer.b === buttons) return;
      lastPointer = { u: u, v: v, b: buttons };
      sceneCmd('pushPointer', [u, v, buttons || 0, 0]);
      return;
    }
    // 网页壁纸：交给 /shim.js 里的转发器合成鼠标事件，保留壁纸自带的悬停/点击交互
    if (webFrame && webFrame.contentWindow) {
      if (lastPointer.u === u && lastPointer.v === v && lastPointer.b === buttons) return;
      lastPointer = { u: u, v: v, b: buttons };
      try {
        webFrame.contentWindow.postMessage({ __wbwe: 1, method: 'pointer', u: u, v: v, buttons: buttons || 0 }, '*');
      } catch (_) {}
    }
  }

  function queuePointer(e) {
    if (!sceneAlive() && !webFrame) return;
    var st = lastState;
    if (st && st.parallax === false) return;
    pointerQueued = {
      u: Math.min(1, Math.max(0, e.clientX / (window.innerWidth || 1))),
      v: Math.min(1, Math.max(0, e.clientY / (window.innerHeight || 1))),
      b: e.buttons || 0,
    };
    if (pointerRaf) return;
    pointerRaf = requestAnimationFrame(function () {
      pointerRaf = 0;
      var p = pointerQueued;
      pointerQueued = null;
      if (p) pointerSend(p.u, p.v, p.b);
    });
  }

  function pointerLeave() {
    if (sceneAlive()) sceneCmd('pointerLeave');
  }

  function bindPointer() {
    if (pointerHandler) return;
    pointerHandler = function (e) { queuePointer(e); };
    document.addEventListener('mousemove', pointerHandler, true);
    document.addEventListener('mousedown', pointerHandler, true);
    document.addEventListener('mouseup', pointerHandler, true);
    document.addEventListener('mouseleave', pointerLeave, true);
  }

  function unbindPointer() {
    if (!pointerHandler) return;
    document.removeEventListener('mousemove', pointerHandler, true);
    document.removeEventListener('mousedown', pointerHandler, true);
    document.removeEventListener('mouseup', pointerHandler, true);
    document.removeEventListener('mouseleave', pointerLeave, true);
    pointerHandler = null;
    if (pointerRaf) { cancelAnimationFrame(pointerRaf); pointerRaf = 0; }
    pointerQueued = null;
  }

  // Scene 渲染失败（缺 pkg / WebGL 不可用）：回落到预览图，别留黑屏
  function sceneFallback(message) {
    if (sceneFailed || !lastState || !holder) return;
    sceneFailed = true;
    clearTimeout(sceneTimer);
    var img = document.createElement('img');
    img.decoding = 'async';
    img.src = lastState.mediaUrl;
    applyView(img, lastState);
    if (sceneFrame) { try { sceneFrame.remove(); } catch (_) {} }
    sceneFrame = null;
    holder.appendChild(img);
    media = img;
    showNotice('Scene 渲染失败，已回落到预览图' + (message ? '：' + message : ''));
    syncBar();
  }

  function bindSceneBridge() {
    if (sceneMsgHandler) return;
    sceneMsgHandler = function (e) {
      var d = e.data;
      if (!d || d.__wbwe !== 1) return;
      if (d.type === 'scene-boot') {
        sceneStage = 'boot';
      } else if (d.type === 'scene-created') {
        sceneStage = 'created';
      } else if (d.type === 'scene-ready') {
        sceneFailed = false;
        sceneReady = true;
        clearTimeout(sceneTimer);
        if (lastState) { sceneSync(lastState); media = sceneFrame; }
        syncBar();
      } else if (d.type === 'scene-error') {
        sceneFallback(d.message);
      }
    };
    window.addEventListener('message', sceneMsgHandler);
  }

  function unbindSceneBridge() {
    if (!sceneMsgHandler) return;
    window.removeEventListener('message', sceneMsgHandler);
    sceneMsgHandler = null;
  }

  // ---------- 宿主内控制面板 ----------
  function closePanel() {
    if (!panelEl) return;
    panelEl.classList.remove('up');
    // 保留 iframe：再次打开无需重新加载页面、样式与数据，避免每次都从头渲染
  }

  function openPanel() {
    var st = lastState;
    if (!st) return;
    if (!panelEl) {
      panelEl = document.createElement('div');
      panelEl.id = PANEL_ID;
      panelEl.innerHTML = '<div class="wbwe-panel-box"><iframe allow="autoplay; fullscreen" allowfullscreen></iframe></div>';
      panelFrame = panelEl.querySelector('iframe');
      panelEl.addEventListener('click', function (e) {
        if (e.target === panelEl) closePanel();
      });
      (document.body || document.documentElement).appendChild(panelEl);
    } else {
      (document.body || document.documentElement).appendChild(panelEl);
    }
    var url = String(st.apiBase || '') + '/?t=' + encodeURIComponent(String(st.token || '')) + '&embed=1';
    if (panelFrame && panelFrame.getAttribute('data-url') !== url) {
      panelFrame.setAttribute('data-url', url);
      panelFrame.src = url;
    }
    panelEl.classList.add('up');
  }

  function applyView(el, state) {
    el.style.objectFit = fitOf(state);
    el.style.objectPosition = 'center center';
    if (state.blur > 0) {
      el.style.filter = 'blur(' + state.blur + 'px)';
      el.style.transform = 'scale(1.06) translateZ(0)';
    } else {
      el.style.filter = '';
      el.style.transform = state.perf ? 'translateZ(0)' : '';
    }
  }

  function maskBackground(alpha) {
    var base = 'var(--wb-bg-primary,#0a0a0a)';
    // 玻璃模式下侧栏自己已有磨砂底色，左侧再压 40% 深色会把壁纸完全闷住。
    var glass = document.documentElement.getAttribute('data-wbwe-glass') === '1';
    var leftTint = glass ? 12 : 40;
    var leftStop = glass ? '0 10%,transparent 30%' : '0 18%,transparent 42%';
    var bottomTint = glass ? 40 : 50;
    var bottomStop = glass ? '66%' : '58%';
    return 'linear-gradient(rgba(0,0,0,' + alpha + '),rgba(0,0,0,' + alpha + ')),'
      + 'linear-gradient(90deg,color-mix(in srgb,' + base + ' ' + leftTint + '%,transparent) ' + leftStop + '),'
      + 'linear-gradient(180deg,transparent 0 ' + bottomStop + ',color-mix(in srgb,' + base + ' ' + bottomTint + '%,transparent) 100%)';
  }

  function clearMedia() {
    mountSeq++;
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) {} blobUrl = ''; }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    if (media && media.pause) { try { media.pause(); } catch (_) {} }
    if (media && media.src && media.tagName === 'VIDEO') { try { media.removeAttribute('src'); media.load(); } catch (_) {} }
    media = null;
    sceneFrame = null;
    webFrame = null;
    scenePaused = false;
    sceneFailed = false;
    sceneReady = false;
    clearTimeout(sceneTimer);
    lastPointer = { u: -1, v: -1, b: -1 };
    if (holder) while (holder.firstChild) holder.removeChild(holder.firstChild);
  }

  function mount(state) {
    clearMedia();
    if (!holder) return;
    var dur = Math.max(0, Math.min(1.5, Number(state.transition) || 0));
    holder.style.transitionDuration = dur + 's';
    holder.style.opacity = dur > 0 ? '0' : '1';
    var el;
    if (state.kind === 'video') {
      el = document.createElement('video');
      el.muted = !state.audio;
      el.loop = true;
      el.autoplay = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.setAttribute('disablepictureinpicture', '');
      el.preload = 'auto';
      var rate = Number(state.videoRate) || 1;
      el.defaultPlaybackRate = rate;
      el.src = state.mediaUrl;
      var kick = function () {
        try { el.playbackRate = rate; } catch (_) {}
        var p = el.play(); if (p && p.catch) p.catch(function () {});
      };
      el.addEventListener('loadeddata', kick, { once: true });
      el.addEventListener('play', function () { setTimeout(syncBar, 30); });
      el.addEventListener('pause', function () { setTimeout(syncBar, 30); });
      kick();
      visibilityHandler = function () {
        if (document.visibilityState === 'hidden') { try { el.pause(); } catch (_) {} }
        else kick();
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    } else if (state.kind === 'web') {
      // file:// 页面不允许直接 iframe http 页面，改为取回 HTML 后以 blob 挂载，
      // 再用 <base> 让壁纸的相对资源仍从本机服务加载。
      el = document.createElement('iframe');
      el.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
      el.setAttribute('referrerpolicy', 'no-referrer');
      el.style.pointerEvents = 'none';
      var seq = mountSeq;
      webFrame = el;
      bindPointer();
      var dir = String(state.webUrl).split('?')[0];
      fetch(state.webUrl, { cache: 'no-store' })
        .then(function (res) { return res.text(); })
        .then(function (html) {
          if (seq !== mountSeq) return;
          var tag = '<base href="' + dir.replace(/"/g, '&quot;') + '">';
          var doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + tag; }) : tag + html;
          blobUrl = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
          el.src = blobUrl;
        })
        .catch(function () {
          if (seq === mountSeq) el.src = state.webUrl;
        });
    } else if (state.kind === 'scene') {
      // Scene：iframe 内由 WebWallGL 实时渲染 scene.pkg / 松散工程（真 WebGL，不是预览图）
      el = document.createElement('iframe');
      el.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
      el.setAttribute('referrerpolicy', 'no-referrer');
      el.style.pointerEvents = 'none';
      el.style.background = '#050506';
      el.src = state.sceneUrl;
      sceneFrame = el;
      sceneReady = false;
      sceneFailed = false;
      bindSceneBridge();
      bindPointer();
      clearTimeout(sceneTimer);
      // http iframe 万一被拦截 / 装配失败而没回调，到点回落预览图，避免一片黑
      sceneTimer = setTimeout(function () {
        if (!sceneReady && sceneFrame && !sceneFailed) sceneFallback('加载超时（可能不支持 WebGL2）');
      }, 45000);
    } else {
      el = document.createElement('img');
      el.src = state.mediaUrl;
      el.decoding = 'async';
    }
    applyView(el, state);
    holder.appendChild(el);
    media = el;
    // 淡入：后台窗口 rAF 会被节流/暂停，必须再用定时器兜底，否则会一直停在 opacity:0
    var shown = false;
    var revealHolder = function () {
      if (shown) return;
      shown = true;
      if (holder) holder.style.opacity = '1';
    };
    if (dur > 0) {
      requestAnimationFrame(function () { requestAnimationFrame(revealHolder); });
      setTimeout(revealHolder, 60);
      setTimeout(revealHolder, Math.round(dur * 1000) + 200);
    } else {
      revealHolder();
    }
    syncBar();
  }

  function ensurePanelEvents() {
    if (!escHandler) {
      escHandler = function (e) {
        if (e.key !== 'Escape') return;
        if (!panelEl || !panelEl.classList.contains('up')) return;
        e.preventDefault();
        e.stopPropagation();
        closePanel();
      };
      document.addEventListener('keydown', escHandler, true);
    }
    if (!panelMsgHandler) {
      panelMsgHandler = function (e) {
        var d = e.data;
        if (!d || d.__wbwe !== 1) return;
        if (d.type === 'close-panel' || d.type === 'minimize-panel') closePanel();
      };
      window.addEventListener('message', panelMsgHandler);
    }
  }

  // ---------- 增强：免打扰 / 自动继续 / 快捷短语 ----------
  function applyDnd(on) {
    var html = document.documentElement;
    if (on) {
      html.setAttribute('data-wbwe-dnd', '1');
      if (!dndSnapshot && typeof window.Notification === 'function') {
        var original = window.Notification;
        var Silent = function () {
          return { close: function () {}, addEventListener: function () {}, removeEventListener: function () {} };
        };
        Silent.permission = 'denied';
        Silent.requestPermission = function () { return Promise.resolve('denied'); };
        dndSnapshot = original;
        window.Notification = Silent;
      }
    } else {
      html.removeAttribute('data-wbwe-dnd');
      if (dndSnapshot) {
        window.Notification = dndSnapshot;
        dndSnapshot = null;
      }
    }
  }

  function stopAutoContinue() {
    if (autoContinueObserver) {
      autoContinueObserver.disconnect();
      autoContinueObserver = null;
    }
    clearTimeout(autoContinueTimer);
    autoContinueTimer = 0;
  }

  function clickContinueButtons() {
    autoContinueTimer = 0;
    if (!autoContinueObserver) return;
    var scope = document.querySelector('.conversation-shell, .cr-message-list, [class*="conversation-shell"]') || document.body;
    if (!scope) return;
    var candidates = scope.querySelectorAll('button, [role="button"]');
    var pattern = /^(继续|继续执行|继续生成|重试|恢复|Continue|Resume|Retry)$/i;
    var now = Date.now();
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.closest('#wbwe-bar, #wbwe-panel, #wbwe-layer')) continue;
      var label = String(el.textContent || '').trim();
      if (!pattern.test(label)) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      var last = lastContinueAt.get(el) || 0;
      if (now - last < 20000) continue;
      lastContinueAt.set(el, now);
      try {
        el.click();
        showNotice('已自动继续会话');
      } catch (_) {}
      return;
    }
  }

  function startAutoContinue() {
    stopAutoContinue();
    autoContinueObserver = new MutationObserver(function () {
      if (autoContinueTimer) return;
      autoContinueTimer = setTimeout(clickContinueButtons, 700);
    });
    autoContinueObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'class'],
    });
    autoContinueTimer = setTimeout(clickContinueButtons, 1200);
  }

  function applyEnhance(enhance) {
    var config = enhance && typeof enhance === 'object' ? enhance : {};
    applyDnd(!!config.dnd);
    if (config.autoContinue) {
      if (!autoContinueObserver) startAutoContinue();
    } else {
      stopAutoContinue();
    }
  }

  var api = {
    id: '',
    version: 26,
    apply: function (state) {
      if (!state) return;
      lastState = state;
      ensureStyle();
      ensureBar();
      ensurePanelEvents();
      applyEnhance(state.enhance);
      if (!state.id) {
        // 空闲态：只保留宿主工具条与面板入口，不创建壁纸层/透明化宿主界面
        api.id = '';
        syncBar();
        return;
      }
      ensureLayer();
      evictOverlays();
      startGuards();
      enforceBackdrop();
      if (!evictTimer) evictTimer = setInterval(evictOverlays, 3000);
      api.id = state.id || '';
      ensureAttrs();
      if (maskEl) maskEl.style.background = maskBackground(Math.min(0.9, Math.max(0, Number(state.mask) || 0)));
      var url = state.kind === 'web' ? state.webUrl : state.kind === 'scene' ? state.sceneUrl : state.mediaUrl;
      if (current.id !== state.id || current.url !== url || !media) {
        current = { id: state.id, url: url };
        mount(state);
      } else if (media) {
        applyView(media, state);
        sceneSync(state);
        if (!state.parallax) sceneCmd('pointerLeave');
        if (holder) holder.style.transitionDuration = Math.max(0, Math.min(1.5, Number(state.transition) || 0)) + 's';
        if (media.tagName === 'VIDEO') { try { media.playbackRate = Number(state.videoRate) || 1; } catch (_) {} }
        syncBar();
      }
      if (state.notice) showNotice(state.notice);
    },
    revealBar: function () { ensureBar(); },
    sceneState: function () {
      return { ready: sceneReady, failed: sceneFailed, paused: scenePaused, stage: sceneStage, url: sceneFrame ? sceneFrame.src : '' };
    },
    dispose: function () {
      clearMedia();
      unbindPointer();
      unbindSceneBridge();
      stopAutoContinue();
      applyDnd(false);
      if (repairObserver) { repairObserver.disconnect(); repairObserver = null; }
      clearTimeout(repairTimer); repairTimer = 0;
      clearInterval(guardTimer); guardTimer = 0;
      clearInterval(evictTimer);
      evictTimer = 0;
      var evicted = document.querySelectorAll('[data-wbwe-evicted]');
      for (var i = 0; i < evicted.length; i++) evicted[i].removeAttribute('data-wbwe-evicted');
      if (escHandler) { document.removeEventListener('keydown', escHandler, true); escHandler = null; }
      if (panelMsgHandler) { window.removeEventListener('message', panelMsgHandler); panelMsgHandler = null; }
      if (window.__wbweBarMove) { document.removeEventListener('mousemove', window.__wbweBarMove, true); window.__wbweBarMove = null; }
      if (window.__wbweBarLeave) { document.removeEventListener('mouseleave', window.__wbweBarLeave); window.__wbweBarLeave = null; }
      var style = document.getElementById(STYLE_ID);
      if (style) style.remove();
      if (layerEl) layerEl.remove();
      if (barEl) barEl.remove();
      var note = document.getElementById(NOTICE_ID);
      if (note) note.remove();
      if (panelEl) { panelEl.remove(); panelEl = null; panelFrame = null; }
      layerEl = null; holder = null; maskEl = null; barEl = null; barBrand = null;
      var restyled = document.querySelectorAll(
        'body,#root,.wb-home-route,.wb-homepage,.detail-new-tab-landing,'
        + '.teams-container,.teams-grid-scroll-content,'
        + '.teams-grid-scroll-content > [class*="_grid_"],'
        + '.teams-grid-scroll-content [class*="_gridView_"],'
        + '.teams-grid-scroll-content [class*="_gridViewItem_"],'
        + '.conversation-shell,.conversation-shell__main',
      );
      for (var s = 0; s < restyled.length; s++) {
        restyled[s].style.removeProperty('background-color');
        restyled[s].style.removeProperty('background-image');
      }
      document.documentElement.style.removeProperty('background-color');
      document.documentElement.style.removeProperty('background-image');
      document.documentElement.removeAttribute('data-wbwe');
      document.documentElement.removeAttribute('data-wbwe-glass');
      document.documentElement.removeAttribute('data-wbwe-perf');
      document.documentElement.removeAttribute('data-wbwe-id');
      current = { id: '', url: '' };
      lastState = null;
      delete window.__wbwe;
      delete window.__wbweDispose;
    },
  };

  window.__wbwe = api;
  window.__wbweDispose = function () { api.dispose(); };
  api.apply(initial);
  return 'created';
}

module.exports = wbweInit;
