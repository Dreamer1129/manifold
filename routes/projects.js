'use strict';

const express = require('express');
const { store, uid, nowIso } = require('../lib/store');
const { validateProject, validationError } = require('../lib/validate');
const { requireKey } = require('../lib/auth');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();

// Everything under /projects needs a valid key, limited per key.
router.use(requireKey);
router.use(rateLimit({
  windowMs: 60_000,
  max: 60,
  keyFn: (req) => (req.apiKey ? req.apiKey.id : req.ip),
  message: 'Too many requests. Limit: 60 per minute per API key.',
}));

router.get('/', (req, res) => {
  let list = [...store.projects];
  const { status, tag, q } = req.query;

  if (status) list = list.filter((p) => p.status === status);
  if (tag) list = list.filter((p) => p.tags.includes(String(tag).toLowerCase()));
  if (q) {
    const needle = String(q).toLowerCase();
    list = list.filter(
      (p) => p.name.toLowerCase().includes(needle) ||
             (p.description || '').toLowerCase().includes(needle),
    );
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const total = list.length;

  res.json({
    data: list.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total,
  });
});

router.post('/', (req, res) => {
  const errors = validateProject(req.body, { projects: store.projects });
  if (errors.length) return res.status(400).json(validationError(errors));

  const t = nowIso();
  const project = {
    id: uid('proj'),
    name: req.body.name.trim(),
    description: typeof req.body.description === 'string' ? req.body.description : '',
    status: req.body.status || 'draft',
    tags: Array.isArray(req.body.tags) ? [...new Set(req.body.tags.map((x) => x.toLowerCase()))] : [],
    createdAt: t,
    updatedAt: t,
  };
  store.projects.unshift(project);
  res.status(201).json(project);
});

router.get('/:id', (req, res) => {
  const p = store.projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found', message: 'Project not found.' });
  res.json(p);
});

router.put('/:id', (req, res) => {
  const p = store.projects.find((x) => x.id === req.params.id);
  if (!p) return res.status(404).json({ error: 'not_found', message: 'Project not found.' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (!Object.keys(body).length) {
    return res.status(400).json({
      error: 'validation_failed',
      layers: ['syntactic'],
      message: 'Provide at least one field to update.',
      details: [],
    });
  }

  // Validate the merged document so partial updates still respect every rule.
  const merged = {
    name: p.name,
    description: p.description,
    status: p.status,
    tags: p.tags,
    ...body,
  };
  const errors = validateProject(merged, { projects: store.projects, selfId: p.id });
  if (errors.length) return res.status(400).json(validationError(errors));

  if (body.name !== undefined) p.name = body.name.trim();
  if (body.description !== undefined) p.description = body.description;
  if (body.status !== undefined) p.status = body.status;
  if (body.tags !== undefined) p.tags = [...new Set(body.tags.map((x) => x.toLowerCase()))];
  p.updatedAt = nowIso();
  res.json(p);
});

router.delete('/:id', (req, res) => {
  const i = store.projects.findIndex((x) => x.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'not_found', message: 'Project not found.' });
  const [removed] = store.projects.splice(i, 1);
  res.json({ id: removed.id, deleted: true });
});

module.exports = router;
