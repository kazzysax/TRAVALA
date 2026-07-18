const express = require("express");
const { createEmbeddedWallet } = require("../lib/privy");
const { createUser, getUserByWallet, getUserByPrivyId } = require("../lib/db");

const router = express.Router();

/// Signup: creates a Privy embedded wallet the first time a given Privy user
/// logs in, and returns the SAME wallet on every subsequent call for that
/// same privyUserId - this is what makes logging in from a second device
/// resolve to one account instead of silently minting a new wallet each
/// time. TravelerCredential minting (the city stamp) happens separately,
/// later, once the user completes location setup, via the backend's
/// minter-role service (not built in this scaffold pass; see
/// technical-plan.md 2.1 - minting is gated to the backend specifically to
/// control gas sponsorship and prevent spam-minting).
router.post("/signup", async (req, res) => {
  try {
    const { privyUserId } = req.body;
    if (!privyUserId) return res.status(400).json({ error: "privyUserId required" });

    const existing = getUserByPrivyId(privyUserId);
    if (existing) {
      return res.status(200).json({ userId: existing.id, walletAddress: existing.walletAddress });
    }

    const { walletAddress } = await createEmbeddedWallet(privyUserId);
    const user = createUser({ privyUserId, walletAddress });
    res.status(201).json({ userId: user.id, walletAddress });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/wallet/:walletAddress", (req, res) => {
  const user = getUserByWallet(req.params.walletAddress);
  if (!user) return res.status(404).json({ error: "not found" });
  res.json(user);
});

module.exports = router;
