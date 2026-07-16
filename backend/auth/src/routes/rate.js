const express = require("express");
const { ethers } = require("ethers");
const { getSessionKey } = require("../lib/db");
const { loadSessionKeySigner } = require("../lib/sessionKey");

const router = express.Router();

const SESSION_PERMISSION_ABI = [
  "function submitRatingViaSession(bytes32 cityId, bytes32 serviceId, uint8 value, string tag) external payable",
];

let provider;
function getProvider() {
  if (!provider) {
    if (!process.env.MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set - see .env.example");
    provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
  }
  return provider;
}

/// The auto-sign path: submits a rating using a previously-granted session
/// key, with no per-rating user signature. Reaches nothing but
/// SessionPermission.submitRatingViaSession - see SessionPermission.sol for
/// why that's a structural guarantee, not just an application-level promise.
router.post("/rate/auto", async (req, res) => {
  try {
    const { sessionKeyAddress, cityId, serviceId, value, tag, feeWei } = req.body;
    const record = getSessionKey(sessionKeyAddress);
    if (!record) return res.status(404).json({ error: "unknown session key" });
    if (Math.floor(Date.now() / 1000) >= record.expiry) {
      return res.status(410).json({ error: "session expired - ask the user to re-grant in Settings" });
    }

    if (!process.env.SESSION_PERMISSION_ADDRESS) {
      throw new Error("SESSION_PERMISSION_ADDRESS not set - see .env.example");
    }

    const signer = loadSessionKeySigner(record.encryptedPrivateKey, getProvider());
    const session = new ethers.Contract(process.env.SESSION_PERMISSION_ADDRESS, SESSION_PERMISSION_ABI, signer);

    const tx = await session.submitRatingViaSession(cityId, serviceId, value, tag || "", { value: feeWei });
    const receipt = await tx.wait();
    res.status(202).json({ txHash: receipt.hash });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/// The manual-sign path is deliberately NOT a backend endpoint: the user's
/// own wallet calls ServiceRating.submitRating directly from the frontend.
/// This route exists only so the indexer/UI has a single place to record
/// "a manual rating happened" for feed purposes, after the fact.
router.post("/rate/manual/ack", (req, res) => {
  const { txHash } = req.body;
  if (!txHash) return res.status(400).json({ error: "txHash required" });
  res.status(202).json({ acknowledged: true });
});

module.exports = router;
