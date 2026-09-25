'use strict';

/* In-memory data store. Deliberately simple: the assignment is about API
   design, validation and telemetry — not persistence. On serverless hosts
   (Vercel) this resets on cold start, which the README calls out honestly. */

const crypto = require('crypto');

const MAX_LOG = 200;   // recent-request ring buffer
const MAX_LAT = 2000;  // latency samples kept for avg/p95

const store = {
  keys: [],
  projects: [],
  requestLog: [],
  latencies: [],
  totals: { requests: 0 },
  byStatus: {},
  byEndpoint: {},
};

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function seed() {
  if (store.projects.length) return;
  const t = nowIso();
  store.projects.push(
    {
      id: uid('proj'),
      name: 'Website Redesign',
      description: 'Marketing site refresh for the Q4 launch.',
      status: 'active',
      tags: ['web', 'q4'],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid('proj'),
      name: 'Mobile App API',
      description: 'Backend endpoints serving the iOS and Android clients.',
      status: 'active',
      tags: ['mobile', 'api'],
      createdAt: t,
      updatedAt: t,
    },
    {
      id: uid('proj'),
      name: 'Data Pipeline',
      description: 'Nightly ETL from the warehouse into analytics.',
      status: 'draft',
      tags: ['data'],
      createdAt: t,
      updatedAt: t,
    },
  );
}

function recordRequest(entry) {
  store.requestLog.unshift(entry);
  if (store.requestLog.length > MAX_LOG) store.requestLog.pop();

  store.totals.requests += 1;
  const s = String(entry.status);
  store.byStatus[s] = (store.byStatus[s] || 0) + 1;

  const ep = store.byEndpoint[entry.endpoint] || { count: 0, totalMs: 0, errors: 0 };
  ep.count += 1;
  ep.totalMs += entry.ms;
  if (entry.status >= 400) ep.errors += 1;
  store.byEndpoint[entry.endpoint] = ep;

  store.latencies.push(entry.ms);
  if (store.latencies.length > MAX_LAT) store.latencies.shift();
}

function metricsSnapshot() {
  const lat = [...store.latencies].sort((a, b) => a - b);
  const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] : 0;

  const endpoints = Object.entries(store.byEndpoint)
    .map(([endpoint, v]) => ({
      endpoint,
      count: v.count,
      avgMs: v.count ? +(v.totalMs / v.count).toFixed(2) : 0,
      errors: v.errors,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    uptimeSec: Math.floor(process.uptime()),
    totalRequests: store.totals.requests,
    avgMs: +avg.toFixed(2),
    p95Ms: +p95.toFixed(2),
    byStatus: store.byStatus,
    endpoints,
    recent: store.requestLog.slice(0, 12),
  };
}

module.exports = { store, uid, nowIso, seed, recordRequest, metricsSnapshot };
