// REQUIRES: swap for a real database before production - an in-memory
// counter resets on every restart, which would silently re-open the
// sponsorship quota. Kept in-memory here so the scaffold runs with zero setup.

const monthlyCount = new Map(); // "YYYY-MM" -> count
const fundedWallets = new Set(); // walletAddress (lowercased) - each wallet is funded at most once, ever

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function alreadyFunded(walletAddress) {
  return fundedWallets.has(walletAddress.toLowerCase());
}

function quotaRemaining(limit) {
  const used = monthlyCount.get(currentMonthKey()) || 0;
  return Math.max(0, limit - used);
}

function recordFunding(walletAddress) {
  const key = currentMonthKey();
  monthlyCount.set(key, (monthlyCount.get(key) || 0) + 1);
  fundedWallets.add(walletAddress.toLowerCase());
}

module.exports = { currentMonthKey, alreadyFunded, quotaRemaining, recordFunding };
