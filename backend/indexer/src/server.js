require("dotenv").config();
const express = require("express");
const feedRoutes = require("./routes/feed");
const rpcRoutes = require("./routes/rpc");
const { startListening } = require("./lib/listener");
const { startKeepAlive } = require("./lib/keepAlive");

const app = express();
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(feedRoutes);
app.use(rpcRoutes);
app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4006;
app.listen(port, () => {
  console.log(`indexer service listening on :${port}`);
  startKeepAlive("https://indexer-y2zq.onrender.com");
});

startListening().catch((err) => {
  console.error("Failed to start event listener:", err.message);
  console.error("The HTTP API above is still up, but it has no data until this succeeds.");
});
