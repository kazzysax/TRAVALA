require("dotenv").config();
const express = require("express");
const scanRoutes = require("./routes/scan");

const app = express();
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "10mb" })); // images as base64 need a larger body limit than express's 100kb default
app.use(scanRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4005;
app.listen(port, () => console.log(`ocr service listening on :${port}`));
