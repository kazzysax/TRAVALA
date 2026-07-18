require("dotenv").config();
const express = require("express");
const expenseRoutes = require("./routes/expenses");
const budgetRoutes = require("./routes/budget");
const splitRoutes = require("./routes/splits");
const { startKeepAlive } = require("./lib/keepAlive");

const app = express();
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(expenseRoutes);
app.use(budgetRoutes);
app.use(splitRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4004;
app.listen(port, () => {
  console.log(`expense service listening on :${port}`);
  startKeepAlive("https://expense-17td.onrender.com");
});
