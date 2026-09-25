'use strict';

/* Manifold console frontend — talks to the live API, no build step. */

const $ = (sel) => document.querySelector(sel);
const KEY_STORAGE = 'manifold:key';

/* ---------- theme ---------- */
const THEME_KEY = 'manifold:theme';

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  const btn = $('#themeToggle');
  btn.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  drawChart(); // repaint chart with theme colors
}

function initTheme() {
  // The <head> script already set the initial theme to avoid a flash;
  // here we just sync the button label and wire the toggle.
  const current = document.documentElement.dataset.theme || 'dark';
  setTheme(current);
  $('#themeToggle').addEventListener('click', () => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
}

/* ---------- tiny fetch wrapper ---------- */
async function callApi(method, endpoint, { body, apiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const started = performance.now();
  const res = await fetch(endpoint, {
    method,
    headers,
    body: body !== undefined ? body : undefined,
  });
  const ms = performance.now() - started;
  const serverMs = res.headers.get('X-Response-Time');
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, ms, serverMs, json };
}

function statusClass(s) {
  if (s < 300) return '';
  if (s < 400) return 'warn';
  return 'err';
}

/* ---------- API status pill ---------- */
async function pingHealth() {
  const pill = $('#apiStatus');
  const label = $('#apiStatusText');
  try {
    const r = await callApi('GET', '/api/health');
    if (r.status === 200 && r.json && r.json.ok) {
      pill.className = 'status-pill ok';
      label.textContent = `API live · ${r.serverMs || ''}`.trim();
    } else {
      throw new Error('unhealthy');
    }
  } catch {
    pill.className = 'status-pill down';
    label.textContent = 'API unreachable';
  }
}

/* ---------- sandbox ---------- */
function syncBodyVisibility() {
  const m = $('#method').value;
  $('#bodyWrap').style.display = (m === 'POST' || m === 'PUT') ? '' : 'none';
}

function fillPreset(btn) {
  $('#method').value = btn.dataset.method;
  $('#endpoint').value = btn.dataset.endpoint;
  if (btn.dataset.body) $('#reqBody').value = btn.dataset.body;
  syncBodyVisibility();
}

async function dispatch() {
  const method = $('#method').value;
  const endpoint = $('#endpoint').value.trim() || '/api/health';
  const apiKey = $('#apiKeyInput').value.trim();
  const rawBody = $('#reqBody').value.trim();

  const btn = $('#dispatchBtn');
  btn.disabled = true;
  btn.textContent = 'Dispatching…';

  try {
    let body;
    if ((method === 'POST' || method === 'PUT') && rawBody) {
      try { JSON.parse(rawBody); }
      catch { throw new Error('Body is not valid JSON — fix it before dispatching.'); }
      body = rawBody;
    }
    const r = await callApi(method, endpoint, { body, apiKey });

    $('#respEmpty').hidden = true;
    $('#respResult').hidden = false;
    const badge = $('#respStatus');
    badge.textContent = r.status;
    badge.className = 'status-badge ' + statusClass(r.status);
    $('#respTime').textContent = `${r.ms.toFixed(1)} ms round-trip`;
    $('#respServerTime').textContent = r.serverMs ? `· server ${r.serverMs}` : '';
    $('#respBody').textContent = JSON.stringify(r.json, null, 2);

    // Remember a working key for next time.
    if (r.status < 300 && apiKey && endpoint.startsWith('/api/projects')) {
      localStorage.setItem(KEY_STORAGE, apiKey);
    }
  } catch (e) {
    $('#respEmpty').hidden = true;
    $('#respResult').hidden = false;
    const badge = $('#respStatus');
    badge.textContent = 'ERR';
    badge.className = 'status-badge err';
    $('#respTime').textContent = '';
    $('#respServerTime').textContent = '';
    $('#respBody').textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span aria-hidden="true">▶</span> Dispatch request';
  }
}

async function quickKey() {
  try {
    const r = await callApi('POST', '/api/keys', { body: JSON.stringify({ name: 'sandbox' }) });
    if (r.status === 201 && r.json.key) {
      $('#apiKeyInput').value = r.json.key;
      localStorage.setItem(KEY_STORAGE, r.json.key);
      refreshKeys();
    }
  } catch { /* pill already shows outage */ }
}

/* ---------- keys ---------- */
async function refreshKeys() {
  const tbody = $('#keysBody');
  try {
    const r = await callApi('GET', '/api/keys');
    const keys = (r.json && r.json.keys) || [];
    if (!keys.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted">No keys yet.</td></tr>';
      return;
    }
    tbody.innerHTML = '';
    keys.forEach((k) => {
      const tr = document.createElement('tr');
      const name = document.createElement('td'); name.textContent = k.name;
      const masked = document.createElement('td'); masked.className = 'mono'; masked.textContent = k.masked;
      const count = document.createElement('td'); count.className = 'mono'; count.textContent = k.requestCount;
      const status = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = 'pill ' + (k.revoked ? 'dead' : 'live');
      pill.textContent = k.revoked ? 'revoked' : 'live';
      status.appendChild(pill);
      const action = document.createElement('td');
      if (!k.revoked) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'link-btn';
        btn.textContent = 'Revoke';
        btn.addEventListener('click', () => revokeKey(k.id));
        action.appendChild(btn);
      }
      tr.append(name, masked, count, status, action);
      tbody.appendChild(tr);
    });
  } catch {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Could not reach the API.</td></tr>';
  }
}

async function issueKey() {
  const nameInput = $('#keyName');
  const errBox = $('#keyError');
  errBox.hidden = true;
  try {
    const r = await callApi('POST', '/api/keys', { body: JSON.stringify({ name: nameInput.value }) });
    if (r.status !== 201) {
      const msg = (r.json && r.json.details && r.json.details[0] && r.json.details[0].message) ||
                  (r.json && r.json.message) || 'Could not issue key.';
      errBox.textContent = msg;
      errBox.hidden = false;
      return;
    }
    $('#newKeyWrap').hidden = false;
    $('#newKeySecret').textContent = r.json.key;
    $('#apiKeyInput').value = r.json.key;
    localStorage.setItem(KEY_STORAGE, r.json.key);
    nameInput.value = '';
    refreshKeys();
  } catch {
    errBox.textContent = 'Could not reach the API.';
    errBox.hidden = false;
  }
}

async function revokeKey(id) {
  await callApi('DELETE', `/api/keys/${encodeURIComponent(id)}`);
  refreshKeys();
}

/* ---------- metrics ---------- */
const samples = []; // { t, avg, p95, rpm }
let lastTotal = 0;
let lastPoll = 0;

function chartColors() {
  const light = document.documentElement.dataset.theme === 'light';
  return {
    grid: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)',
    text: light ? '#68707e' : '#98a2b3',
    avg: light ? '#b45309' : '#fbbf24',
    p95: light ? '#0d9488' : '#2dd4bf',
  };
}

function drawChart() {
  const canvas = $('#latChart');
  if (!canvas || !canvas.clientWidth) return;
  const c = chartColors();
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = 180;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, (h / 4) * i);
    ctx.lineTo(w, (h / 4) * i);
    ctx.stroke();
  }

  if (samples.length < 2) {
    ctx.fillStyle = c.text;
    ctx.font = '12px ui-monospace, monospace';
    ctx.fillText('Dispatch requests in the sandbox to draw the chart…', 12, h / 2);
    return;
  }

  const max = Math.max(10, ...samples.map((s) => s.p95));
  const x = (i) => (i / (samples.length - 1)) * (w - 8) + 4;
  const y = (v) => h - 12 - (v / max) * (h - 28);

  const line = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    samples.forEach((s, i) => {
      const px = x(i), py = y(s[key]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  };
  line('avg', c.avg);
  line('p95', c.p95);
}

async function refreshMetrics() {
  try {
    const r = await callApi('GET', '/api/metrics');
    if (r.status !== 200 || !r.json) return;
    const m = r.json;

    $('#mTotal').textContent = m.totalRequests;
    $('#mAvg').textContent = `${m.avgMs} ms`;
    $('#mP95').textContent = `${m.p95Ms} ms`;

    let errors = 0;
    Object.entries(m.byStatus).forEach(([code, n]) => {
      if (Number(code) >= 400) errors += n;
    });
    const errRate = m.totalRequests ? (errors / m.totalRequests) * 100 : 0;
    $('#mErr').textContent = `${errRate.toFixed(1)}%`;

    // chart samples
    const now = Date.now();
    if (lastPoll) {
      const rpm = ((m.totalRequests - lastTotal) / ((now - lastPoll) / 1000)) * 60;
      samples.push({ t: now, avg: m.avgMs, p95: m.p95Ms, rpm });
      if (samples.length > 40) samples.shift();
      drawChart();
    }
    lastTotal = m.totalRequests;
    lastPoll = now;

    // status bars
    const bars = $('#statusBars');
    const codes = Object.entries(m.byStatus).sort((a, b) => b[1] - a[1]);
    if (!codes.length) {
      bars.innerHTML = '<p class="muted">Waiting for traffic…</p>';
    } else {
      const top = codes[0][1];
      bars.innerHTML = '';
      codes.forEach(([code, n]) => {
        const row = document.createElement('div');
        row.className = 'status-bar-row';
        const label = document.createElement('span'); label.textContent = code;
        const track = document.createElement('div'); track.className = 'status-bar-track';
        const fill = document.createElement('div');
        fill.className = 'status-bar-fill' + (code.startsWith('5') ? ' e5' : code.startsWith('4') ? ' e4' : '');
        fill.style.width = `${Math.max(3, (n / top) * 100)}%`;
        track.appendChild(fill);
        const count = document.createElement('span'); count.textContent = n;
        row.append(label, track, count);
        bars.appendChild(row);
      });
    }

    // recent requests
    const recent = $('#recentBody');
    if (!m.recent.length) {
      recent.innerHTML = '<tr><td colspan="5" class="muted">No requests yet.</td></tr>';
    } else {
      recent.innerHTML = '';
      m.recent.forEach((rq) => {
        const tr = document.createElement('tr');
        const time = document.createElement('td'); time.className = 'mono';
        time.textContent = new Date(rq.time).toLocaleTimeString();
        const method = document.createElement('td');
        const mb = document.createElement('span');
        mb.className = 'm m-' + rq.method.toLowerCase();
        mb.textContent = rq.method;
        method.appendChild(mb);
        const path = document.createElement('td'); path.className = 'mono'; path.textContent = rq.path;
        const status = document.createElement('td');
        const sb = document.createElement('span');
        sb.className = 'status-badge ' + statusClass(rq.status);
        sb.style.fontSize = '0.72rem';
        sb.textContent = rq.status;
        status.appendChild(sb);
        const ms = document.createElement('td'); ms.className = 'mono'; ms.textContent = `${rq.ms} ms`;
        tr.append(time, method, path, status, ms);
        recent.appendChild(tr);
      });
    }
  } catch { /* keep old numbers on a failed poll */ }
}

/* ---------- wire up ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initTheme();

  const saved = localStorage.getItem(KEY_STORAGE);
  if (saved) $('#apiKeyInput').value = saved;

  $('#method').addEventListener('change', syncBodyVisibility);
  syncBodyVisibility();

  document.querySelectorAll('.chip-btn').forEach((b) =>
    b.addEventListener('click', () => fillPreset(b)),
  );
  $('#dispatchBtn').addEventListener('click', dispatch);
  $('#quickKey').addEventListener('click', quickKey);
  $('#issueBtn').addEventListener('click', issueKey);
  $('#copyKey').addEventListener('click', async () => {
    const secret = $('#newKeySecret').textContent;
    try {
      await navigator.clipboard.writeText(secret);
      $('#copyKey').textContent = 'Copied!';
      setTimeout(() => { $('#copyKey').textContent = 'Copy'; }, 1500);
    } catch { /* clipboard unavailable */ }
  });

  pingHealth();
  setInterval(pingHealth, 15000);
  refreshKeys();
  refreshMetrics();
  setInterval(refreshMetrics, 2500);
  window.addEventListener('resize', drawChart);
});
