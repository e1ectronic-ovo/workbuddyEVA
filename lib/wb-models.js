'use strict';

// WorkBuddy 自定义模型配置（models.json）。官方模型由服务端下发，这里只管理用户添加的模型。
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./paths');
const { profile } = require('./wb-paths');

const WB_DIR = path.join(DATA_DIR, 'wb');
const DISABLED_FILE = path.join(WB_DIR, 'models-disabled.json');
const BACKUPS_DIR = path.join(WB_DIR, 'backups');

function modelsFile() {
  return profile().modelsFile;
}

function readArray(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(value) ? value : [];
  } catch (_) {
    return [];
  }
}

function writeArray(file, list) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
  fs.renameSync(tmp, file);
}

function backup() {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    const source = modelsFile();
    if (!fs.existsSync(source)) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(source, path.join(BACKUPS_DIR, 'models-' + stamp + '.json'));
  } catch (_) {}
}

function maskKey(value) {
  const key = typeof value === 'string' ? value : '';
  if (!key) return '';
  if (key.length <= 8) return '已设置';
  return key.slice(0, 3) + '…' + key.slice(-4);
}

function publicModel(model, disabled) {
  return {
    id: String(model.id || ''),
    name: String(model.name || model.id || ''),
    vendor: String(model.vendor || 'Custom'),
    url: String(model.url || ''),
    apiKeyMasked: maskKey(model.apiKey),
    hasKey: typeof model.apiKey === 'string' && model.apiKey.length > 0,
    supportsToolCall: !!model.supportsToolCall,
    supportsImages: !!model.supportsImages,
    supportsReasoning: !!model.supportsReasoning,
    disabled: !!disabled,
  };
}

function list() {
  const active = readArray(modelsFile()).map((item) => publicModel(item, false));
  const disabled = readArray(DISABLED_FILE).map((item) => publicModel(item, true));
  return active.concat(disabled);
}

function findActive(id) {
  return readArray(modelsFile()).find((item) => String(item.id) === String(id)) || null;
}

function normalizeInput(input, previous) {
  const id = String((input && input.id) || '').trim();
  const name = String((input && input.name) || '').trim() || id;
  const url = String((input && input.url) || '').trim();
  if (!id) throw new Error('模型 ID 不能为空');
  if (!/^[A-Za-z0-9._:/@-]{1,120}$/.test(id)) throw new Error('模型 ID 含非法字符');
  if (!url) throw new Error('接口地址不能为空');
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('bad protocol');
  } catch (_) {
    throw new Error('接口地址必须是 http/https URL');
  }
  const apiKey = String((input && input.apiKey) || '').trim();
  if (!apiKey && !(previous && previous.apiKey)) throw new Error('API Key 不能为空');
  return {
    id,
    name,
    vendor: String((input && input.vendor) || (previous && previous.vendor) || 'Custom').trim() || 'Custom',
    url,
    apiKey: apiKey || previous.apiKey,
    supportsToolCall: input && input.supportsToolCall !== undefined ? !!input.supportsToolCall : !!(previous && previous.supportsToolCall),
    supportsImages: input && input.supportsImages !== undefined ? !!input.supportsImages : !!(previous && previous.supportsImages),
    supportsReasoning: input && input.supportsReasoning !== undefined ? !!input.supportsReasoning : !!(previous && previous.supportsReasoning),
    useCustomProtocol: !!(previous && previous.useCustomProtocol),
  };
}

function save(input) {
  const originalId = String((input && input.originalId) || input.id || '').trim();
  const active = readArray(modelsFile());
  const disabled = readArray(DISABLED_FILE);
  let previous = active.find((item) => String(item.id) === originalId)
    || disabled.find((item) => String(item.id) === originalId)
    || null;
  const model = normalizeInput(input, previous);
  if (active.some((item) => String(item.id) === model.id && String(item.id) !== originalId)
    || disabled.some((item) => String(item.id) === model.id && String(item.id) !== originalId)) {
    throw new Error('该模型 ID 已存在');
  }
  backup();
  const next = active.filter((item) => String(item.id) !== originalId);
  next.push(model);
  writeArray(modelsFile(), next);
  const remaining = disabled.filter((item) => String(item.id) !== originalId);
  if (remaining.length !== disabled.length) writeArray(DISABLED_FILE, remaining);
  return publicModel(model, false);
}

function remove(id) {
  const active = readArray(modelsFile());
  const disabled = readArray(DISABLED_FILE);
  if (!active.some((item) => String(item.id) === id) && !disabled.some((item) => String(item.id) === id)) {
    throw new Error('模型不存在');
  }
  backup();
  writeArray(modelsFile(), active.filter((item) => String(item.id) !== id));
  writeArray(DISABLED_FILE, disabled.filter((item) => String(item.id) !== id));
  return { id: String(id) };
}

function setEnabled(id, enabled) {
  const active = readArray(modelsFile());
  const disabled = readArray(DISABLED_FILE);
  if (enabled) {
    const model = disabled.find((item) => String(item.id) === id);
    if (!model) throw new Error('未找到已停用的模型');
    backup();
    writeArray(DISABLED_FILE, disabled.filter((item) => String(item.id) !== id));
    writeArray(modelsFile(), active.concat(model));
    return publicModel(model, false);
  }
  const model = active.find((item) => String(item.id) === id);
  if (!model) throw new Error('未找到已启用的模型');
  backup();
  writeArray(modelsFile(), active.filter((item) => String(item.id) !== id));
  writeArray(DISABLED_FILE, disabled.concat(model));
  return publicModel(model, true);
}

function fullModel(id) {
  const model = findActive(id);
  if (!model) throw new Error('未找到该模型');
  return model;
}

module.exports = { list, save, remove, setEnabled, modelsFile, fullModel };
