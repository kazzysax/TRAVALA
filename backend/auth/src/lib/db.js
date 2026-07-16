// REQUIRES: swap this in-memory store for a real database (Postgres, etc.)
// before anything but local dev touches this service. Kept dependency-free
// and in-memory here so the scaffold runs anywhere with no native build step;
// the schema below is what a real migration should reproduce.
//
// users:        { id, privyUserId, walletAddress, createdAt }
// sessionKeys:  { sessionKeyAddress, userId, encryptedPrivateKey, expiry, createdAt }

const users = new Map(); // id -> user
const usersByWallet = new Map(); // walletAddress -> id
const sessionKeys = new Map(); // sessionKeyAddress -> record

let nextUserId = 1;

function createUser({ privyUserId, walletAddress }) {
  const id = String(nextUserId++);
  const user = { id, privyUserId, walletAddress, createdAt: new Date().toISOString() };
  users.set(id, user);
  usersByWallet.set(walletAddress.toLowerCase(), id);
  return user;
}

function getUserByWallet(walletAddress) {
  const id = usersByWallet.get(walletAddress.toLowerCase());
  return id ? users.get(id) : undefined;
}

function saveSessionKey(record) {
  sessionKeys.set(record.sessionKeyAddress.toLowerCase(), record);
}

function getSessionKey(sessionKeyAddress) {
  return sessionKeys.get(sessionKeyAddress.toLowerCase());
}

module.exports = { createUser, getUserByWallet, saveSessionKey, getSessionKey };
