'use strict';

/* Manifold API — one Express app, two hosts:
   - locally: mounted by server.js (with static frontend)
   - on Vercel: exported as the /api serverless function (see vercel.json) */

const express = require('express');
const { seed } = require('../lib/store');
const { telemetry } = require('../lib/telemetry');
const keysRouter = require('../routes/keys');
const projectsRouter = require('../routes/projects');
const metricsRouter = require('../routes/metrics');

const app = express();
app.set('trust proxy', true);

seed();

app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(telemetry);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'manifold',
    version: '1.0.0',
    uptimeSec: Math.floor(process.uptime()),
  });
});

app.use('/api/keys', keysRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/metrics', metricsRouter);

app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No such endpoint: ${req.method} ${req.path}`,
  });
});

// Malformed JSON and friends land here as clean 400s, not stack traces.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'validation_failed',
      layers: ['syntactic'],
      message: 'Request body is not valid JSON.',
      details: [{
        field: 'body',
        code: 'invalid_json',
        message: 'Malformed JSON payload.',
        layer: 'syntactic',
      }],
    });
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
});

module.exports = app;
