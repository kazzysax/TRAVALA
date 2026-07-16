require("dotenv").config();
const express = require("express");
const feedRoutes = require("./routes/feed");
const { startListening } = require("./lib/listener");

const app = express();
app.use(feedRoutes);
app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4006;
app.listen(port, () => console.log(`indexer service listening on :${port}`));

startListening().catch((err) => {
  console.error("Failed to start event listener:", err.message);
  console.error("The HTTP API above is still up, but it has no data until this succeeds.");
});
