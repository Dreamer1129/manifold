'use strict';

/* Telemetry middleware: measures every request with nanosecond precision,
   exposes it via the X-Response-Time header, and feeds the metrics store. */

const { recordRequest } = require('./store');

function endpointOf(req) {
  let ep;
  if (req.route) {
    ep = (req.baseUrl || '') + req.route.path;
  } else {
    ep = req.path;
  }
  if (ep.length > 1 && ep.endsWith('/')) ep = ep.slice(0, -1);
  return `${req.method} ${ep}`;
}

function telemetry(req, res, next) {
  const start = process.hrtime.bigint();

  const origWriteHead = res.writeHead;
  res.writeHead = function (...args) {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    if (!res.getHeader('X-Response-Time')) {
      res.setHeader('X-Response-Time', `${ms.toFixed(2)}ms`);
    }
    return origWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    recordRequest({
      time: new Date().toISOString(),
      method: req.method,
      path: req.originalUrl.split('?')[0],
      endpoint: endpointOf(req),
      status: res.statusCode,
      ms: +ms.toFixed(2),
      key: req.apiKey ? req.apiKey.name : null,
    });
  });

  next();
}

module.exports = { telemetry };
