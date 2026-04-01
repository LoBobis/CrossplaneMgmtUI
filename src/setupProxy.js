const { createProxyMiddleware } = require("http-proxy-middleware");

// In dev mode (npm start), proxy /api/* requests to kubectl proxy
// so we don't need nginx. Start kubectl proxy first:
//   kubectl proxy --port=8001
module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:8001",
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
    })
  );
};
