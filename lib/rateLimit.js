'use strict';

/* Sliding-window rate limiter. Exceeding the budget returns HTTP 429 with a
   Retry-After header so well-behaved clients can back off. */

function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const windowStart = now - windowMs;
    const times = (hits.get(key) || []).filter((t) => t > windowStart);

    if (times.length >= max) {
      const retryAfter = Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'rate_limited',
        message: message || `Too many requests. Limit: ${max} per ${Math.round(windowMs / 1000)}s.`,
        retryAfterSec: retryAfter,
      });
    }

    times.push(now);
    hits.set(key, times);
    next();
  };
}

module.exports = { rateLimit };
