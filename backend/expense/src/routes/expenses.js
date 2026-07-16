const express = require("express");
const { convert } = require("../lib/currency");
const { addExpense, listExpenses, getBudget, spentToday } = require("../lib/db");

const router = express.Router();

const CATEGORIES = ["Food & drink", "Transport", "Lodging", "Activities"];

/// Records an expense, converting it to the user's home currency immediately
/// (matching money.html's "Converted to your home currency automatically").
router.post("/users/:userId/expenses", async (req, res) => {
  try {
    const { amount, currency, category, note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "amount required" });
    if (!currency) return res.status(400).json({ error: "currency required" });
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of ${CATEGORIES.join(", ")}` });
    }

    const { homeCurrency } = getBudget(req.params.userId);
    if (!homeCurrency) return res.status(400).json({ error: "set a home currency via /budget first" });

    const amountHomeCurrency = await convert(amount, currency, homeCurrency);
    const entry = addExpense(req.params.userId, {
      amountOriginal: amount,
      currencyOriginal: currency,
      amountHomeCurrency,
      homeCurrency,
      category,
      note: note || "",
    });
    res.status(201).json(entry);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/users/:userId/expenses", (req, res) => {
  res.json(listExpenses(req.params.userId));
});

router.get("/users/:userId/budget-status", (req, res) => {
  const { dailyBudget, homeCurrency } = getBudget(req.params.userId);
  const spent = spentToday(req.params.userId);
  res.json({
    dailyBudget,
    homeCurrency,
    spentToday: spent,
    remainingToday: dailyBudget !== null ? Math.max(0, dailyBudget - spent) : null,
  });
});

module.exports = router;
