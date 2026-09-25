'use strict';

/* API key lifecycle: issue, authenticate, mask for display, revoke. */

const crypto = require('crypto');
const { store, nowIso } = require('./store');

function issueKey(name) {
  const secret = 'mf_live_' + crypto.randomBytes(18).toString('hex');
  const record = {
    id: 'key_' + crypto.randomBytes(6).toString('hex'),
    name: name.trim(),
    secret,
    createdAt: nowIso(),
    lastUsedAt: null,
    requestCount: 0,
    revoked: false,
  };
  store.keys.push(record);
  return record;
}

function requireKey(req, res, next) {
  const secret = req.header('x-api-key');
  if (!secret) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing x-api-key header. Issue a key via POST /api/keys.',
    });
  }
  const record = store.keys.find((k) => k.secret === secret && !k.revoked);
  if (!record) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid or revoked API key.',
    });
  }
  record.lastUsedAt = nowIso();
  record.requestCount += 1;
  req.apiKey = record;
  next();
}

function publicKey(k) {
  return {
    id: k.id,
    name: k.name,
    masked: `${k.secret.slice(0, 11)}…${k.secret.slice(-4)}`,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt,
    requestCount: k.requestCount,
    revoked: k.revoked,
  };
}

module.exports = { issueKey, requireKey, publicKey };
