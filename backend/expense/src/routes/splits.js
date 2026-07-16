const express = require("express");
const { convert } = require("../lib/currency");
const { addExpense, getBudget } = require("../lib/db");

const router = express.Router();

/// Splits one shared expense evenly across participants, converting each
/// participant's share into their own home currency (technical-plan.md 3.4:
/// "expenses, budgets, group splits").
router.post("/groups/:groupId/split-expense", async (req, res) => {
  try {
    const { amount, currency, category, note, participantUserIds } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: "amount required" });
    if (!Array.isArray(participantUserIds) || participantUserIds.length === 0) {
      return res.status(400).json({ error: "participantUserIds required" });
    }

    const share = amount / participantUserIds.length;
    const entries = [];
    for (const userId of participantUserIds) {
      const { homeCurrency } = getBudget(userId);
      if (!homeCurrency) {
        return res.status(400).json({ error: `user ${userId} has no home currency set - call /budget first` });
      }
      const amountHomeCurrency = await convert(share, currency, homeCurrency);
      entries.push(
        addExpense(userId, {
          amountOriginal: share,
          currencyOriginal: currency,
          amountHomeCurrency,
          homeCurrency,
          category,
          note: note || "",
          groupId: req.params.groupId,
          splitWith: participantUserIds.filter((id) => id !== userId),
        })
      );
    }
    res.status(201).json({ groupId: req.params.groupId, entries });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
