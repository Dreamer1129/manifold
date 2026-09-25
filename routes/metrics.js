'use strict';

const express = require('express');
const { metricsSnapshot, store } = require('../lib/store');

const router = express.Router();

// Open endpoint — this is the platform's own status page.
router.get('/', (req, res) => {
  res.json({
    ...metricsSnapshot(),
    keysIssued: store.keys.length,
    projectsTracked: store.projects.length,
  });
});

module.exports = router;
