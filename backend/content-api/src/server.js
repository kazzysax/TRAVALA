require("dotenv").config();
const express = require("express");
const cityRoutes = require("./routes/cities");
const nearbyRoutes = require("./routes/nearby");

const app = express();
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(cityRoutes);
app.use(nearbyRoutes);
app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4003;
app.listen(port, () => console.log(`content-api service listening on :${port}`));
