require("dotenv").config();
const express = require("express");
const scanRoutes = require("./routes/scan");

const app = express();
app.use(express.json({ limit: "10mb" })); // images as base64 need a larger body limit than express's 100kb default
app.use(scanRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4005;
app.listen(port, () => console.log(`ocr service listening on :${port}`));
