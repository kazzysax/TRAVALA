// Shared Privy-backed wallet module, imported by every page that needs a
// wallet (login/dashboard/money/recommendations/settings/stamp). Centralized
// here instead of duplicated per-page because unlike the small per-page API
// URL constants, this is real auth/session/signing logic - six copies of it
// is a correctness risk, not just noise.
import Privy, {
  LocalStorage,
  getUserEmbeddedEthereumWallet,
  getEntropyDetailsFromUser,
} from "https://esm.sh/@privy-io/js-sdk-core@latest";
import { ethers } from "https://esm.sh/ethers@6.14.0";

export const AUTH_API = "https://auth-jtty.onrender.com";
export const INDEXER_API = "https://indexer-y2zq.onrender.com";

let configPromise;
let privyPromise;

/// Fetches backend/auth's public config once and caches it - privyAppId/
/// privyClientId/sessionPermissionAddress are all non-secret values the
/// frontend needs but shouldn't hardcode per-page. See
/// backend/auth/src/server.js GET /config.
export function getConfig() {
  if (!configPromise) configPromise = fetch(`${AUTH_API}/config`).then((r) => r.json());
  return configPromise;
}

function initPrivy() {
  if (!privyPromise) {
    privyPromise = (async () => {
      const { privyAppId, privyClientId } = await getConfig();
      if (!privyAppId || !privyClientId) {
        throw new Error("Privy isn't configured on the backend yet - PRIVY_APP_ID/PRIVY_CLIENT_ID missing");
      }
      const privy = new Privy({ appId: privyAppId, clientId: privyClientId, storage: new LocalStorage() });
      await privy.initialize();
      return privy;
    })();
  }
  return privyPromise;
}

/// Returns { user, walletAddress } for the currently logged-in Privy
/// session, or null if nobody is logged in on this device/browser.
export async function getSession() {
  const privy = await initPrivy();
  const { user } = await privy.user.get();
  if (!user) return null;
  const wallet = getUserEmbeddedEthereumWallet(user);
  if (!wallet) return null;
  return { user, walletAddress: wallet.address };
}

/// Step 1 of email OTP login - sends a one-time code to the given address.
export async function loginWithEmail(email) {
  const privy = await initPrivy();
  await privy.auth.email.sendCode(email);
}

/// Step 2 of email OTP login - verifies the code, then resolves the
/// canonical wallet address via the backend's /signup (idempotent per
/// privyUserId - same person, same wallet, on any device).
export async function submitOtp(email, code) {
  const privy = await initPrivy();
  const session = await privy.auth.email.loginWithCode(email, code);
  const res = await fetch(`${AUTH_API}/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privyUserId: session.user.id }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "signup failed");
  return { user: session.user, walletAddress: data.walletAddress };
}

export async function logout() {
  const privy = await initPrivy();
  await privy.auth.logout();
}

/// For every page other than login.html: resolves the current wallet or
/// bounces to login.html if nobody's signed in on this device. Returns a
/// read-only provider (same indexer RPC proxy every page already used) plus
/// a lazy getSigner() for pages that need to send a real transaction -
/// signing happens through Privy's embedded wallet, so no private key ever
/// touches this code, matching the "no seed phrase" product promise.
export async function requireWallet() {
  const session = await getSession();
  if (!session) {
    window.location.href = "login.html";
    throw new Error("not logged in - redirecting");
  }
  const provider = new ethers.JsonRpcProvider(`${INDEXER_API}/rpc`);

  async function getSigner() {
    const privy = await initPrivy();
    const { user } = await privy.user.get();
    const wallet = getUserEmbeddedEthereumWallet(user);
    const { entropyId, entropyIdVerifier } = getEntropyDetailsFromUser(user);
    const ethereumProvider = await privy.embeddedWallet.getEthereumProvider({
      wallet,
      entropyId,
      entropyIdVerifier,
    });
    const browserProvider = new ethers.BrowserProvider(ethereumProvider);
    return browserProvider.getSigner();
  }

  return { address: session.walletAddress, provider, getSigner };
}
