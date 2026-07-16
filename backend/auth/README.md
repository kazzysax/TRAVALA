# backend/auth

Auth & wallet custody service: signup (embedded wallet creation via Privy),
and the two ratings paths - manual (frontend signs directly, this service
just acknowledges) and auto-sign (this service holds a granted session key
and calls `SessionPermission.submitRatingViaSession`).

## Requires before this actually runs

- A Privy app (`PRIVY_APP_ID`, `PRIVY_APP_SECRET`) - dashboard.privy.io.
  Dynamic/Web3Auth are the named alternatives in `technical-plan.md`; swap
  `src/lib/privy.js` for their server API if you'd rather use one of those.
- Deployed contract addresses from Stage 1
  (`contracts/hardhat/scripts/deploy.js` output) and a Monad RPC URL.
- A real secrets manager for `RELAYER_PRIVATE_KEY` and for encrypting session
  keys at rest - `src/lib/sessionKey.js` currently has a placeholder
  "encryption" that is plaintext, clearly marked, and must not survive past
  local dev.
- A real database - `src/lib/db.js` is an in-memory Map right now so this
  scaffold runs with zero setup; swap it for Postgres (or similar) before any
  real user touches it, since an in-memory store forgets everyone on restart.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `POST /signup` `{ privyUserId }` -> creates an embedded wallet, returns `{ userId, walletAddress }`
- `GET /wallet/:walletAddress` -> user record
- `POST /wallet/:walletAddress/session-key` `{ expirySeconds }` -> generates a session key, returns its address and the exact `grantSession` call the user's own wallet must sign
- `POST /rate/auto` `{ sessionKeyAddress, cityId, serviceId, value, tag, feeWei }` -> submits a rating via the granted session key, no per-rating user signature
- `POST /rate/manual/ack` `{ txHash }` -> records that a manually-signed rating happened (the actual submission is the frontend calling `ServiceRating.submitRating` directly)
