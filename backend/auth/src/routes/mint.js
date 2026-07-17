const express = require("express");
const { ethers } = require("ethers");

const router = express.Router();

const CREDENTIAL_ABI = [
  "function mintStamp(address to, string country, string city) external returns (uint256 tokenId)",
];

let signer;
function getMinterSigner() {
  if (signer) return signer;
  const { MONAD_RPC_URL, MINTER_PRIVATE_KEY } = process.env;
  if (!MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set");
  if (!MINTER_PRIVATE_KEY) throw new Error("MINTER_PRIVATE_KEY not set");
  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  signer = new ethers.Wallet(MINTER_PRIVATE_KEY, provider);
  return signer;
}

/// Mints a real TravelerCredential city-stamp NFT once a user completes
/// location setup. Only this backend's dedicated minter key can call
/// mintStamp (MINTER_ROLE on TravelerCredential.sol) - gating minting here,
/// not letting users call it directly, is what prevents spam-minting and
/// keeps gas sponsorship controlled (technical-plan.md 2.1).
router.post("/mint", async (req, res) => {
  try {
    const { walletAddress, country, city } = req.body;
    if (!walletAddress || !ethers.isAddress(walletAddress)) {
      return res.status(400).json({ error: "valid walletAddress required" });
    }
    if (!country || !city) return res.status(400).json({ error: "country and city required" });

    if (!process.env.TRAVELER_CREDENTIAL_ADDRESS) {
      throw new Error("TRAVELER_CREDENTIAL_ADDRESS not set");
    }

    const minter = getMinterSigner();
    const credential = new ethers.Contract(process.env.TRAVELER_CREDENTIAL_ADDRESS, CREDENTIAL_ABI, minter);

    const tx = await credential.mintStamp(walletAddress, country, city);
    const receipt = await tx.wait();
    res.status(201).json({ txHash: receipt.hash });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
