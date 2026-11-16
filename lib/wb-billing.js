'use strict';

// WorkBuddy 官方计费接口：每日签到与剩余额度。只使用账号自己的 accessToken。
const { profile } = require('./wb-paths');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
const ISSUER_HOSTS = {
  'https://www.workbuddy.ai': 'https://www.workbuddy.ai',
  'https://www.workbuddy.cn': 'https://www.workbuddy.cn',
  'https://www.codebuddy.cn': 'https://www.codebuddy.cn',
  'https://www.codebuddy.ai': 'https://www.codebuddy.ai',
};
const INACTIVE = /未开启|未开始|未开放|已过期|无.*活动|活动.*(?:结束|关闭|暂停)/i;
const ALREADY = /已签到|已领取|已经.*(?:签到|领取)|重复签到|already\s*(?:checked[- ]?in|claimed)|already/i;
const ENTERPRISE_TYPES = new Set(['enterprise', 'team', 'company', 'business', 'enterprise_edition']);

function issuerOrigin(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString('utf8'));
    return new URL(String(payload.iss || '')).origin.toLowerCase();
  } catch (_) {
    return '';
  }
}

function apiHosts(token) {
  const issuer = issuerOrigin(token);
  const mapped = ISSUER_HOSTS[issuer];
  if (mapped) return [mapped];
  const current = profile();
  const list = [current.apiHost];
  if (current.region === 'cn') {
    for (const host of ['https://www.codebuddy.cn', 'https://www.workbuddy.cn']) {
      if (!list.includes(host)) list.push(host);
    }
  }
  return list;
}

function headers(token, account) {
  return {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'x-client-platform': 'web',
    authorization: 'Bearer ' + token,
    'x-user-id': String((account && account.uid) || ''),
    'x-domain': String((account && account.domain) || ''),
    'user-agent': UA,
  };
}

function classifyCheckin(httpOk, code, message) {
  const number = code === null || code === undefined || code === '' ? null : Number(code);
  const text = String(message || '');
  const inactive = INACTIVE.test(text);
  const already = number === 10001 && !inactive && ALREADY.test(text);
  return {
    ok: !inactive && ((number === 0 && httpOk) || already),
    already,
    inactive,
    code: Number.isFinite(number) ? number : null,
    message: text,
  };
}

async function checkin(token, account) {
  let first401 = null;
  let last = null;
  for (const host of apiHosts(token)) {
    for (const route of ['/billing/meter/daily-checkin', '/v2/billing/meter/daily-checkin']) {
      try {
        const response = await fetch(host + route, {
          method: 'POST',
          headers: Object.assign(headers(token, account), { origin: host, referer: host + '/profile/plans-usage' }),
          body: '{}',
          signal: AbortSignal.timeout(12000),
        });
        const raw = await response.text();
        let data = {};
        try { data = JSON.parse(raw); } catch (_) {}
        const result = classifyCheckin(response.ok, data.code, data.msg || data.message || (response.ok ? 'ok' : 'HTTP ' + response.status));
        if (result.ok) return Object.assign(result, { url: host + route });
        if (response.status === 401) {
          first401 = first401 || { ok: false, already: false, expired: true, code: 401, message: '登录身份过期', url: host + route };
          continue;
        }
        last = Object.assign(result, { url: host + route });
        if (response.status === 404) continue;
      } catch (error) {
        last = { ok: false, already: false, code: -1, message: error.name === 'TimeoutError' ? '请求超时' : error.message };
      }
    }
  }
  return first401 || last || { ok: false, already: false, code: -1, message: '签到接口无响应' };
}

function localDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

function resourceBody() {
  const now = new Date();
  const end = new Date(now.getTime());
  end.setFullYear(end.getFullYear() + 101);
  return {
    PageNumber: 1,
    PageSize: 100,
    ProductCode: 'p_tcaca',
    Status: [0, 3],
    PackageEndTimeRangeBegin: localDateTime(now),
    PackageEndTimeRangeEnd: localDateTime(end),
  };
}

const REMAIN_FIELDS = ['CycleCapacityRemainPrecise', 'CycleCapacityRemain', 'CapacityRemainPrecise', 'CapacityRemain', 'RemainPrecise', 'Remain', 'Remaining', 'Balance'];
const TOTAL_FIELDS = ['CycleCapacitySizePrecise', 'CycleCapacitySize', 'CapacityPrecise', 'Capacity', 'TotalCapacityPrecise', 'TotalCapacity', 'Quota'];
const EXPIRE_FIELDS = ['DeductionEndTime', 'ExpiredTime', 'CycleEndTime', 'EndTime', 'ExpireTime', 'ExpirationTime'];
const LABEL_FIELDS = ['PackageName', 'AccountName', 'ProductName', 'Name', 'Description'];

function pickNumber(item, fields) {
  for (const field of fields) {
    const raw = item && item[field];
    if (raw === undefined || raw === null || raw === '') continue;
    const number = Number(raw);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function pickText(item, fields) {
  for (const field of fields) {
    const raw = item && item[field];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return '';
}

function pickDate(item) {
  let earliest = 0;
  for (const field of EXPIRE_FIELDS) {
    const raw = item && item[field];
    if (!raw) continue;
    const parsed = /^\d+$/.test(String(raw))
      ? Number(raw) * (String(raw).length <= 10 ? 1000 : 1)
      : Date.parse(String(raw).replace(/^(\d{4}-\d\d-\d\d)\s+/, '$1T'));
    if (!Number.isFinite(parsed)) continue;
    if (!earliest || parsed < earliest) earliest = parsed;
  }
  return earliest || null;
}

function extractSegments(accounts) {
  const segments = [];
  for (const account of accounts) {
    const details = Array.isArray(account && account.SlicePeriodUsageDetails) && account.SlicePeriodUsageDetails.length
      ? account.SlicePeriodUsageDetails
      : [account];
    for (const row of details) {
      const remaining = pickNumber(row, REMAIN_FIELDS);
      if (remaining === null || remaining <= 0) continue;
      segments.push({
        remaining: Number(remaining.toFixed(2)),
        total: pickNumber(row, TOTAL_FIELDS),
        expiresAt: pickDate(row),
        label: pickText(row, LABEL_FIELDS) || '额度',
      });
    }
  }
  return segments.sort((a, b) => (a.expiresAt || Infinity) - (b.expiresAt || Infinity));
}

async function personalCredits(token, account) {
  let expired = false;
  for (const host of apiHosts(token)) {
    let response;
    try {
      response = await fetch(host + '/v2/billing/meter/get-user-resource', {
        method: 'POST',
        headers: Object.assign(headers(token, account), { origin: host, referer: host + '/profile/plans-usage' }),
        body: JSON.stringify(resourceBody()),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw new Error('额度接口超时');
      throw error;
    }
    if (response.status === 401) { expired = true; continue; }
    const raw = await response.text();
    if (!response.ok) {
      if (response.status === 404) continue;
      throw new Error('额度接口 HTTP ' + response.status);
    }
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('额度接口返回格式无法解析'); }
    if (data.code !== undefined && Number(data.code) !== 0) throw new Error(data.msg || ('额度接口 code=' + data.code));
    const payload = (data.data && data.data.Response && data.data.Response.Data)
      || (data.data && data.data.data && data.data.data.Response && data.data.data.Response.Data)
      || null;
    const accounts = (payload && Array.isArray(payload.Accounts) ? payload.Accounts : null)
      || (data.data && Array.isArray(data.data.accounts) ? data.data.accounts : null)
      || [];
    const segments = extractSegments(accounts);
    const credits = segments.length
      ? Number(segments.reduce((sum, item) => sum + item.remaining, 0).toFixed(2))
      : 0;
    return {
      credits,
      segments,
      count: accounts.length,
      cycleResetTime: null,
      unlimited: false,
      todayUsage: payload && payload.TotalDosage !== undefined ? Number(payload.TotalDosage) || 0 : null,
    };
  }
  const error = new Error(expired ? '登录身份过期' : '额度接口无响应');
  if (expired) error.expired = true;
  throw error;
}

async function enterpriseCredits(token, account) {
  if (!account.enterpriseId) throw new Error('企业账号缺少企业 ID，无法查询额度');
  for (const host of apiHosts(token)) {
    const response = await fetch(host + '/v2/billing/meter/get-enterprise-user-usage', {
      method: 'POST',
      headers: Object.assign(headers(token, account), {
        origin: host,
        referer: host + '/profile/plans-usage',
        'x-enterprise-id': account.enterpriseId,
        'x-tenant-id': account.enterpriseId,
      }),
      body: '{}',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401) continue;
    const raw = await response.text();
    if (!response.ok) {
      if (response.status === 404) continue;
      throw new Error('企业额度接口 HTTP ' + response.status);
    }
    let data;
    try { data = JSON.parse(raw); } catch (_) { throw new Error('企业额度返回格式无法解析'); }
    const payload = data.data || {};
    const limit = Number(payload.limitNum);
    const credits = Number(payload.credit);
    const unlimited = limit === -1;
    return {
      credits: Number.isFinite(credits) ? credits : null,
      segments: [],
      count: 1,
      cycleResetTime: payload.cycleResetTime || null,
      unlimited,
      todayUsage: null,
    };
  }
  const error = new Error('登录身份过期');
  error.expired = true;
  throw error;
}

async function credits(token, account) {
  const enterprise = (account && account.enterpriseId)
    || (account && ENTERPRISE_TYPES.has(String(account.type || '').toLowerCase()));
  return enterprise ? enterpriseCredits(token, account) : personalCredits(token, account);
}

module.exports = { checkin, credits, issuerOrigin };
