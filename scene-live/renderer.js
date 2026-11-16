'use strict';

// 运行在 iframe（http://127.0.0.1）里，由宿主 file:// 页面通过 postMessage 驱动。
// 渲染本身交给 WebWallGL：scene.pkg / 松散 scene.json 都能读，天光和材质是实时 WebGL。
(function () {
  var params = new URLSearchParams(location.search);
  var mediaBase = params.get('base') || '';
  // 相对路径补成绝对地址：httpSource 会以它为基址取 project.json 与散装资源
  if (mediaBase.charAt(0) === '/') mediaBase = location.origin + mediaBase;
  var fit = params.get('fit') || 'cover';
  var fps = Number(params.get('fps')) || 60;
  var volume = params.get('muted') === 'false' ? 1 : 0;
  var host = document.getElementById('wp');
  var statusEl = document.getElementById('status');
  var dead = false;
  var inst = null;

  function tell(message) {
    try { parent.postMessage({ __wbwe: 1, type: 'scene-error', message: String(message || '') }, '*'); } catch (_) {}
  }

  function beacon(type, extra) {
    try {
      var msg = { __wbwe: 1, type: type };
      if (extra) msg.message = String(extra);
      parent.postMessage(msg, '*');
    } catch (_) {}
  }

  beacon('scene-boot');
  window.addEventListener('error', function (e) {
    tell((e && e.message) || '脚本错误');
  });

  function fail(message) {
    if (dead) return;
    dead = true;
    if (statusEl) {
      statusEl.textContent = message || '渲染失败';
      statusEl.style.opacity = '1';
    }
    tell(message);
  }

  var api = window.WebWallGL;
  if (!api || typeof api.createScene !== 'function' || typeof api.httpSource !== 'function') {
    fail('WebWallGL 未加载');
    return;
  }
  if (!mediaBase) {
    fail('缺少 scene 资源路径');
    return;
  }

  if (fit !== 'contain' && fit !== 'stretch') fit = 'cover';

  try {
    inst = api.createScene(host, {
      fit: fit,
      fps: fps,
      volume: volume,
      autoQuality: true,
      onDiagnostic: function (d) {
        if (!d) return;
        if (d.level === 'error' || d.level === 'warn') console.warn('[wbwe-scene]', d.message || d);
      },
    });
  } catch (err) {
    fail(err && err.message ? err.message : '创建渲染器失败');
    return;
  }

  window.__wp = inst;
  beacon('scene-created');

  Promise.resolve(inst.load(api.httpSource(mediaBase)))
    .then(function () {
      if (dead) return;
      if (statusEl) { statusEl.style.opacity = '0'; }
      try { parent.postMessage({ __wbwe: 1, type: 'scene-ready' }, '*'); } catch (_) {}
      // 初始指针放屏幕中央，避免视差一开始偏到角落
      try { inst.pushPointer(0.5, 0.5, 0, {}); } catch (_) {}
    })
    .catch(function (err) {
      fail(err && err.message ? err.message : 'scene.pkg 加载失败');
    });

  function call(name, args) {
    if (!inst || typeof inst[name] !== 'function') return;
    try { inst[name].apply(inst, args || []); } catch (_) {}
  }

  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.__wbwe !== 1 || !inst) return;
    var args = Array.isArray(d.args) ? d.args : [];
    if (d.method === 'setFit') call('setFit', [args[0]]);
    else if (d.method === 'setFps') call('setFps', [args[0]]);
    else if (d.method === 'setVolume') call('setVolume', [args[0]]);
    else if (d.method === 'pause') call('pause');
    else if (d.method === 'resume') call('resume');
    else if (d.method === 'pushPointer') call('pushPointer', [args[0], args[1], args[2] || 0, Number(args[3]) || 0]);
    else if (d.method === 'pointerLeave') call('pointerLeave');
    else if (d.method === 'release') call('release');
    else if (d.method === 'restore') call('restore');
    else if (d.method === 'setRenderDpr') call('setRenderDpr', [args[0]]);
  });

  // 遮挡暂停：宿主把窗口藏起来时释放渲染资源
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') call('pause');
    else if (!dead) call('resume');
  });

  window.addEventListener('pagehide', function () { call('release'); });
})();
