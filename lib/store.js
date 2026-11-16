'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = require('./paths').DATA_DIR;
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

const DEFAULTS = {
  selectedId: '',
  options: { mask: 0.25, blur: 0, fit: 'cover', glass: true, audio: false, perf: true, sceneFps: 60, parallax: true, transition: 0.4, videoRate: 1 },
  extraRoots: [],
  hidden: [],
  rotation: { enabled: false, minutes: 30, shuffle: true },
};

function clamp(n, min, max, fallback) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

function sanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const opt = src.options && typeof src.options === 'object' ? src.options : {};
  const rot = src.rotation && typeof src.rotation === 'object' ? src.rotation : {};
  return {
    selectedId: typeof src.selectedId === 'string' ? src.selectedId : '',
    options: {
      mask: clamp(opt.mask, 0, 0.9, DEFAULTS.options.mask),
      blur: clamp(opt.blur, 0, 40, DEFAULTS.options.blur),
      fit: ['cover', 'contain', 'stretch'].includes(opt.fit) ? opt.fit : 'cover',
      glass: opt.glass !== false,
      audio: opt.audio === true,
      perf: opt.perf !== false,
      sceneFps: [30, 60, 90, 120].includes(Number(opt.sceneFps)) ? Number(opt.sceneFps) : 60,
      parallax: opt.parallax !== false,
      transition: clamp(opt.transition, 0, 1.5, DEFAULTS.options.transition),
      videoRate: [0.5, 0.75, 1, 1.25, 1.5, 2].includes(Number(opt.videoRate)) ? Number(opt.videoRate) : 1,
    },
    extraRoots: Array.isArray(src.extraRoots) ? src.extraRoots.filter(p => typeof p === 'string' && path.isAbsolute(p)) : [],
    hidden: Array.isArray(src.hidden) ? src.hidden.filter(id => typeof id === 'string' && id) : [],
    rotation: {
      enabled: rot.enabled === true,
      minutes: [5, 10, 15, 30, 60, 120].includes(Number(rot.minutes)) ? Number(rot.minutes) : 30,
      shuffle: rot.shuffle !== false,
    },
  };
}

function load() {
  try {
    return sanitize(JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')));
  } catch (_) {
    return sanitize(DEFAULTS);
  }
}

function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sanitize(state), null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_FILE);
}

module.exports = { load, save, DEFAULTS };
