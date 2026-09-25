'use strict';

/* Local dev entry point. On Vercel the Express app is served from api/index.js
   and static files come from public/ automatically. */

const path = require('path');
const express = require('express');
const api = require('./api/index');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use(api);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Manifold running → http://localhost:${PORT}`);
  console.log(`API health      → http://localhost:${PORT}/api/health`);
});
