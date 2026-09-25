# Manifold — API Developer Platform

A developer API platform built with **Node.js + Express** (DecodeLabs Full Stack Project 2).
Issue API keys, run validated CRUD against a live REST API, and watch every
request measured in real time — from a dark console frontend with a live
sandbox, metrics dashboard, key manager and endpoint docs.

**Live:** deploy to Vercel (see below) · **Stack:** Node.js, Express, vanilla HTML/CSS/JS

## Quickstart

```bash
npm install
npm start
# → http://localhost:3000
```

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it in Vercel (framework preset: **Other**).
3. Deploy — no build step needed. `vercel.json` routes `/api/*` to the
   Express app in `api/index.js`; static files are served from `public/`.

## API reference

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | open | Service status & uptime |
| POST | `/api/keys` | open · 10/min per IP | Issue an API key (secret shown once) |
| GET | `/api/keys` | open | List keys (secrets masked) |
| DELETE | `/api/keys/:id` | open | Revoke a key |
| GET | `/api/projects` | `x-api-key` | List/filter (`status`, `tag`, `q`) · paginate (`page`, `limit`) |
| POST | `/api/projects` | `x-api-key` | Create — dual-layer validation |
| GET | `/api/projects/:id` | `x-api-key` | Fetch one |
| PUT | `/api/projects/:id` | `x-api-key` | Partial update — merged doc re-validated |
| DELETE | `/api/projects/:id` | `x-api-key` | Delete |
| GET | `/api/metrics` | open | Live telemetry |

### The gatekeeper rule

*"Never trust the client."* Writes pass two validation layers before touching data:

- **Syntactic** — types, lengths, enums, formats (`{"name": "x"}` dies here).
- **Semantic** — domain rules, e.g. project names must be unique (duplicates die here).

Violations return `HTTP 400` naming the failing layer per field.
Abuse the endpoints and the sliding-window limiter answers `HTTP 429`
with a `Retry-After` header. Every response carries an `X-Response-Time`
header measured with `process.hrtime`.

### Try it

```bash
# issue a key
curl -s -X POST localhost:3000/api/keys \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo"}'

# create a project (replace KEY)
curl -s -X POST localhost:3000/api/projects \
  -H 'Content-Type: application/json' -H 'x-api-key: KEY' \
  -d '{"name":"Launch Site","status":"active","tags":["web"]}'

# watch it fail validation
curl -s -X POST localhost:3000/api/projects \
  -H 'Content-Type: application/json' -H 'x-api-key: KEY' \
  -d '{"name":"x"}'
```

## Notes

- The frontend ships a **dark/light theme toggle** (persisted in
  `localStorage`, seeded from the OS preference, flicker-free).
- The data store is **in-memory** (seeded with 3 demo projects) and resets on
  restart / serverless cold start — a deliberate, honest trade-off for the
  assignment scope. Swap `lib/store.js` for a real database to persist.
- Frontend is dependency-free vanilla JS; charts are hand-drawn on canvas.
