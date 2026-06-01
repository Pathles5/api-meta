import { createError } from "./errorHandler.js";

const clients = new Map();

function rateLimit({ windowMs = 60000, max = 100 } = {}) {
  return (req, res, next) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    const now = Date.now();

    if (!clients.has(clientIp)) {
      clients.set(clientIp, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const client = clients.get(clientIp);

    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + windowMs;
      return next();
    }

    client.count++;

    if (client.count > max) {
      const retryAfter = Math.ceil((client.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return next(createError(429, "Too many requests"));
    }

    next();
  };
}

function cleanupClients() {
  const now = Date.now();
  for (const [ip, client] of clients.entries()) {
    if (now > client.resetTime) {
      clients.delete(ip);
    }
  }
}

const cleanupInterval = setInterval(cleanupClients, 60000);
cleanupInterval.unref();

function stopCleanup() {
  clearInterval(cleanupInterval);
}

export { rateLimit, stopCleanup };
