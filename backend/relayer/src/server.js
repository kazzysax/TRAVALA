require("dotenv").config();
const express = require("express");
const fundRoutes = require("./routes/fund");

const app = express();
app.use(express.json());
app.use(fundRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4002;
app.listen(port, () => console.log(`relayer service listening on :${port}`));
