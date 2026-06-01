function cors(options = {}) {
  const {
    origin = "*",
    methods = "GET, POST, PUT, DELETE, OPTIONS",
    allowedHeaders = "Content-Type, Authorization, X-API-Key",
    exposedHeaders = "X-RateLimit-Limit, X-RateLimit-Remaining",
    maxAge = 86400,
  } = options;

  return (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", methods);
    res.setHeader("Access-Control-Allow-Headers", allowedHeaders);
    res.setHeader("Access-Control-Expose-Headers", exposedHeaders);
    res.setHeader("Access-Control-Max-Age", maxAge);

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
}

export { cors };
