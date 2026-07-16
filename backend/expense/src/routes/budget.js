const express = require("express");
const { setBudget, getBudget } = require("../lib/db");

const router = express.Router();

router.put("/users/:userId/budget", (req, res) => {
  const { dailyBudget, homeCurrency } = req.body;
  if (!dailyBudget || dailyBudget <= 0) return res.status(400).json({ error: "dailyBudget required" });
  if (!homeCurrency) return res.status(400).json({ error: "homeCurrency required" });
  res.json(setBudget(req.params.userId, { dailyBudget, homeCurrency }));
});

router.get("/users/:userId/budget", (req, res) => {
  res.json(getBudget(req.params.userId));
});

module.exports = router;
