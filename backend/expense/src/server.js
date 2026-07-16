require("dotenv").config();
const express = require("express");
const expenseRoutes = require("./routes/expenses");
const budgetRoutes = require("./routes/budget");
const splitRoutes = require("./routes/splits");

const app = express();
app.use(express.json());
app.use(expenseRoutes);
app.use(budgetRoutes);
app.use(splitRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4004;
app.listen(port, () => console.log(`expense service listening on :${port}`));
