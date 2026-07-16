const express = require("express");
const { createEmbeddedWallet } = require("../lib/privy");
const { createUser, getUserByWallet } = require("../lib/db");

const router = express.Router();

/// Signup: creates a Privy embedded wallet for a brand-new user. This is the
/// only place a wallet gets created - TravelerCredential minting (the city
/// stamp) happens separately, later, once the user completes location setup,
/// via the backend's minter-role service (not built in this scaffold pass;
/// see technical-plan.md 2.1 - minting is gated to the backend specifically
/// to control gas sponsorship and prevent spam-minting).
router.post("/signup", async (req, res) => {
  try {
    const { privyUserId } = req.body;
    if (!privyUserId) return res.status(400).json({ error: "privyUserId required" });

    const { walletAddress } = await createEmbeddedWallet();
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
