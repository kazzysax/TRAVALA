// Thin wrapper around Privy's server REST API for embedded wallet creation.
// REQUIRES: PRIVY_APP_ID / PRIVY_APP_SECRET from your Privy dashboard.
// Verify the exact endpoint/response shape against Privy's current docs
// before relying on this - API surfaces shift between SDK versions, and this
// is written against their documented REST pattern (Basic auth over
// app-id:app-secret) rather than a specific SDK package, so it won't rot if
// a client SDK's import path changes.

const PRIVY_API_BASE = "https://api.privy.io/v1";

function authHeader() {
  const { PRIVY_APP_ID, PRIVY_APP_SECRET } = process.env;
  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("PRIVY_APP_ID / PRIVY_APP_SECRET not set - see .env.example");
  }
  const basic = Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");
  return { Authorization: `Basic ${basic}`, "privy-app-id": PRIVY_APP_ID };
}

/// Creates a new embedded wallet LINKED TO a specific Privy user, via
/// POST /v1/users/{user_id}/wallets (not the bare /v1/wallets endpoint,
/// which creates an app-owned wallet with no user attached). Linking at
/// creation is what lets that same user's client-side Privy session later
/// find and sign with this exact wallet - the whole reason this signup path
/// stays idempotent-per-user instead of every login minting a fresh wallet.
/// The private key never leaves Privy's infrastructure - this service never
/// sees or stores it, which is the entire point of using an established
/// embedded-wallet provider instead of building custodial key management
/// from scratch (per technical-plan.md).
async function createEmbeddedWallet(privyUserId) {
  const res = await fetch(`${PRIVY_API_BASE}/users/${privyUserId}/wallets`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ wallets: [{ chain_type: "ethereum" }] }),
  });
  if (!res.ok) {
    throw new Error(`Privy wallet creation failed: ${res.status} ${await res.text()}`);
  }
  const user = await res.json();
  // Response is a User object; the new wallet shows up in linked_accounts.
  // Verify this shape against a real Privy sandbox response before mainnet -
  // matches Privy's documented LinkedAccountEthereumEmbeddedWallet shape as
  // of this writing, but linked_accounts can contain other account types too.
  const wallet = (user.linked_accounts || []).find(
    (a) => a.type === "wallet" && a.chain_type === "ethereum" && a.wallet_client_type === "privy"
  );
  if (!wallet) {
    throw new Error("Privy wallet creation succeeded but no ethereum embedded wallet found in linked_accounts");
  }
  return { walletAddress: wallet.address, privyWalletId: wallet.id };
}

/// Verifies a Privy auth token from the frontend, returning the Privy user id.
async function verifyAuthToken(authToken) {
  const res = await fetch(`${PRIVY_API_BASE}/users/me`, {
    headers: { ...authHeader(), Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error("invalid or expired auth token");
  }
  const user = await res.json();
  return user.id;
}

module.exports = { createEmbeddedWallet, verifyAuthToken };
