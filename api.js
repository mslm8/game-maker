'use strict';
// API client — all persistence goes through the backend.
// Auth token is kept in window.name + memory: the deployed preview iframe blocks
// browser storage APIs and the proxy strips Set-Cookie, so Bearer headers are
// the reliable session mechanism there. Cookies still work when served directly.

const API_BASE = (typeof window.__API_BASE__ !== 'undefined' && window.__API_BASE__ && !window.__API_BASE__.startsWith('__PORT'))
  ? window.__API_BASE__ : '';

const TOKEN_KEY = 'studio_token';
let memToken = '';
// Session token storage: window.name + memory only.
// Browser storage APIs are blocked in the deployed preview iframe (and cookies
// are stripped by the proxy); window.name is JS-accessible there and survives reloads.
function getToken() {
  if (memToken) return memToken;
  try { const m = /studio_token=([A-Za-z0-9_-]+)/.exec(window.name || ''); if (m) return m[1]; } catch (e) { /* sandboxed */ }
  return '';
}
function setToken(t) {
  memToken = t || '';
  try {
    let n = String(window.name || '').replace(/(;)?studio_token=[A-Za-z0-9_-]*/g, '');
    if (t) n = (n ? n + ';' : '') + 'studio_token=' + t;
    window.name = n;
  } catch (e) { /* sandboxed */ }
}

async function api(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  const token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(API_BASE + url, opts);
  } catch (e) {
    throw new Error('ارتباط با سرور برقرار نشد');
  }
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || ('HTTP ' + res.status));
    err.status = res.status;
    err.data = data;
    if (res.status === 401) {
      setToken('');
      if (data && data.code === 'AUTH_REQUIRED' && !location.hash.startsWith('#/login')) {
        // session expired / missing → show the login view
        if (window.App) App.state.user = null;
        location.hash = '#/login';
        if (typeof renderView === 'function') renderView();
      }
    }
    throw err;
  }
  // keep the session token in sync with the backend
  if (/^\/api\/auth\/(login|signup)$/.test(url.split('?')[0]) && data && data.token) setToken(data.token);
  if (/^\/api\/auth\/logout/.test(url.split('?')[0])) setToken('');
  return data;
}

const Api = {
  get: (url) => api('GET', url),
  post: (url, body) => api('POST', url, body || {}),
  put: (url, body) => api('PUT', url, body),
  patch: (url, body) => api('PATCH', url, body || {}),
  del: (url) => api('DELETE', url),
  clearToken: () => setToken(''),
};
