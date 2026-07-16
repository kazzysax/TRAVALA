const express = require("express");
const { generateSessionKey } = require("../lib/sessionKey");
const { getUserByWallet, saveSessionKey } = require("../lib/db");

const router = express.Router();

/// Step 1 of turning on auto-sign: the backend generates a session-key
/// keypair and hands back only its address. The frontend then prompts the
/// user's own wallet to sign the actual grant transaction -
/// SessionPermission.grantSession(sessionKeyAddress, expiry) - so the
/// private key this backend holds can never be used for anything until the
/// user has explicitly, onchain, authorized it (and only for
/// submitRatingViaSession, per SessionPermission.sol's structural scoping).
router.post("/wallet/:walletAddress/session-key", (req, res) => {
  const user = getUserByWallet(req.params.walletAddress);
  if (!user) return res.status(404).json({ error: "wallet not registered" });

  const { expirySeconds } = req.body; // e.g. 30 days: 30 * 24 * 60 * 60
  if (!expirySeconds || expirySeconds <= 0) {
    return res.status(400).json({ error: "expirySeconds required" });
  }

  const { sessionKeyAddress, encryptedPrivateKey } = generateSessionKey();
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;

  saveSessionKey({ sessionKeyAddress, userId: user.id, encryptedPrivateKey, expiry });

  res.status(201).json({
    sessionKeyAddress,
    expiry,
    grantCalldata: {
      contract: "SessionPermission",
      function: "grantSession",
      args: [sessionKeyAddress, expiry],
      note: "User's own wallet must sign and send this call - the backend never does.",
    },
  });
});

module.exports = router;
