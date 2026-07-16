const express = require("express");
const { ethers } = require("ethers");
const { alreadyFunded, quotaRemaining, recordFunding } = require("../lib/quota");
const { getMasterWalletSigner } = require("../lib/masterWallet");

const router = express.Router();

const MONTHLY_QUOTA = Number(process.env.MONTHLY_QUOTA || 20);
const SPONSORSHIP_AMOUNT_MON = process.env.SPONSORSHIP_AMOUNT_MON || "2";

/// Sponsors a brand-new wallet with 2 MON, up to 20 wallets per calendar
/// month (technical-plan.md 3.2). Each wallet can only ever be funded once,
/// ever, regardless of quota state - this is the rate-limit called out in
/// DEPLOY_TO_MAINNET.md's security checklist to prevent drain attacks via
/// repeated funding requests for the same address.
router.post("/fund", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: "valid walletAddress required" });
    }

    if (alreadyFunded(walletAddress)) {
      return res.status(409).json({ funded: false, reason: "already_funded" });
    }

    const remaining = quotaRemaining(MONTHLY_QUOTA);
    if (remaining <= 0) {
      return res.status(200).json({
        funded: false,
        reason: "quota_exceeded",
        message: `Monthly sponsorship quota reached - please self-fund at least ${SPONSORSHIP_AMOUNT_MON} MON (about 50 MON is more than enough for normal use).`,
      });
    }

    const wallet = getMasterWalletSigner();
    const tx = await wallet.sendTransaction({
      to: walletAddress,
      value: ethers.parseEther(SPONSORSHIP_AMOUNT_MON),
    });
    const receipt = await tx.wait();

    recordFunding(walletAddress);
    res.status(200).json({ funded: true, txHash: receipt.hash, amountMon: SPONSORSHIP_AMOUNT_MON });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/quota", (_req, res) => {
  res.json({ limit: MONTHLY_QUOTA, remaining: quotaRemaining(MONTHLY_QUOTA) });
});

module.exports = router;
