const { Wallet } = require("ethers");

// REQUIRES: replace this with real envelope encryption (KMS/secrets manager)
// before storing anything but a local-dev throwaway key. A session key is
// deliberately low-value - SessionPermission.sol structurally limits it to
// submitRatingViaSession and nothing else, and the user can revoke it
// onchain at any time - but "low-value" is not "no value"; don't store it
// in plaintext once this leaves your laptop.
function encryptPlaceholder(plaintext) {
  return `PLAINTEXT-DEV-ONLY:${plaintext}`;
}

function decryptPlaceholder(ciphertext) {
  return ciphertext.replace(/^PLAINTEXT-DEV-ONLY:/, "");
}

/// Generates a new ephemeral session-key keypair. The address is handed back
/// to the frontend so the user's own wallet can call
/// SessionPermission.grantSession(sessionKeyAddress, expiry) - that grant
/// transaction is signed by the user, never by this backend. This backend
/// only ever uses the resulting private key to call
/// SessionPermission.submitRatingViaSession on the user's behalf.
function generateSessionKey() {
  const wallet = Wallet.createRandom();
  return {
    sessionKeyAddress: wallet.address,
    encryptedPrivateKey: encryptPlaceholder(wallet.privateKey),
  };
}

function loadSessionKeySigner(encryptedPrivateKey, provider) {
  return new Wallet(decryptPlaceholder(encryptedPrivateKey), provider);
}

module.exports = { generateSessionKey, loadSessionKeySigner };
