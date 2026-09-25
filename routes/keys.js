'use strict';

const express = require('express');
const { store } = require('../lib/store');
const { validateKeyInput, validationError } = require('../lib/validate');
const { issueKey, publicKey } = require('../lib/auth');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();

// Key issuance is IP-limited so one client can't mint keys in a loop.
const issueLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyFn: (req) => req.ip,
  message: 'Too many keys issued. Limit: 10 per minute per IP.',
});

router.post('/', issueLimiter, (req, res) => {
  const errors = validateKeyInput(req.body);
  if (errors.length) return res.status(400).json(validationError(errors));

  const record = issueKey(req.body.name);
  res.status(201).json({
    id: record.id,
    name: record.name,
    key: record.secret, // shown exactly once
    createdAt: record.createdAt,
    warning: 'Copy this key now — it will never be shown again.',
  });
});

router.get('/', (req, res) => {
  res.json({ keys: store.keys.map(publicKey) });
});

router.delete('/:id', (req, res) => {
  const record = store.keys.find((k) => k.id === req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'not_found', message: 'API key not found.' });
  }
  record.revoked = true;
  res.json({ id: record.id, revoked: true });
});

module.exports = router;
