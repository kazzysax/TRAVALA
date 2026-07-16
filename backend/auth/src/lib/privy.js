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

/// Creates a new embedded wallet for a user via Privy. Returns the wallet's
/// address and Privy's internal wallet id. The private key never leaves
/// Privy's infrastructure - this service never sees or stores it, which is
/// the entire point of using an established embedded-wallet provider instead
/// of building custodial key management from scratch (per technical-plan.md).
async function createEmbeddedWallet() {
  const res = await fetch(`${PRIVY_API_BASE}/wallets`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ chain_type: "ethereum" }),
  });
  if (!res.ok) {
    throw new Error(`Privy wallet creation failed: ${res.status} ${await res.text()}`);
  }
  const wallet = await res.json();
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
