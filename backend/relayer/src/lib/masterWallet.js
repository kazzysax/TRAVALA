const { ethers } = require("ethers");

let signer;

/// Loads the master/treasury wallet signer. REQUIRES a real secrets-manager
/// integration in production (see .env.example) - this reads directly from
/// process.env only because that's the minimum needed to make the scaffold
/// runnable locally; it is explicitly not what should run against real funds.
function getMasterWalletSigner() {
  if (signer) return signer;
  const { MONAD_RPC_URL, MASTER_WALLET_PRIVATE_KEY } = process.env;
  if (!MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set - see .env.example");
  if (!MASTER_WALLET_PRIVATE_KEY) throw new Error("MASTER_WALLET_PRIVATE_KEY not set - see .env.example");
  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  signer = new ethers.Wallet(MASTER_WALLET_PRIVATE_KEY, provider);
  return signer;
}

module.exports = { getMasterWalletSigner };
