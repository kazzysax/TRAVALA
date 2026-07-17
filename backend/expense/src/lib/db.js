// REQUIRES: swap for a real database - this is deliberately off-chain
// personal financial data (technical-plan.md 3.4), and an in-memory store
// forgets everyone on restart. In-memory here so the scaffold runs anywhere
// with no native build step.

const expenses = new Map(); // userId -> array of expense records
const budgets = new Map(); // userId -> { dailyBudget, homeCurrency }

let nextExpenseId = 1;

function addExpense(userId, record) {
  const list = expenses.get(userId) || [];
  const entry = { id: String(nextExpenseId++), createdAt: new Date().toISOString(), ...record };
  list.push(entry);
  expenses.set(userId, list);
  return entry;
}

function listExpenses(userId) {
  return expenses.get(userId) || [];
}

function setBudget(userId, budget) {
  budgets.set(userId, budget);
  return budget;
}

function getBudget(userId) {
  return budgets.get(userId) || { dailyBudget: null, tripBudget: null, homeCurrency: null };
}

function spentToday(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return listExpenses(userId)
    .filter((e) => e.createdAt.slice(0, 10) === today)
    .reduce((sum, e) => sum + e.amountHomeCurrency, 0);
}

function spentTotal(userId) {
  return listExpenses(userId).reduce((sum, e) => sum + e.amountHomeCurrency, 0);
}

module.exports = { addExpense, listExpenses, setBudget, getBudget, spentToday, spentTotal };

