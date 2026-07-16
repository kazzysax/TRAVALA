# Travel Companion App — Full Technical Plan
**Wallet-native city guide, local help, and expense tracker with onchain service ratings (Monad)**

---

## 1. System Architecture Overview

Three layers, cleanly separated so each can be built, tested, and secured independently:

```
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (React web app)                                     │
│  Landing → Wallet Login → Location/NFT → Dashboard →          │
│  City Guide / Local Help / Money / Recommendations / Settings │
└───────────────────────────┬────────────────────────────────────┘
                             │ HTTPS/REST
┌───────────────────────────▼────────────────────────────────────┐
│  BACKEND (API + services)                                      │
│  Auth · Wallet custody service · Funding relayer ·             │
│  Content API (guide/local help data) · Expense DB ·             │
│  OCR/translation proxy · Rating queue                          │
└───────────────────────────┬────────────────────────────────────┘
                             │ JSON-RPC
┌───────────────────────────▼────────────────────────────────────┐
│  ONCHAIN (Monad, EVM-compatible)                                │
│  TravelerCredential.sol (ERC-721 NFT, city stamps)              │
│  ServiceRating.sol (rating storage)                             │
│  SessionPermission.sol (scoped auto-sign for ratings only)      │
└──────────────────────────────────────────────────────────────┘
```

**Why this separation matters**: the backend owns *custody and business logic* (who can sign what, how much gas to send), the smart contracts own *trust and permanence* (NFTs, ratings), and the frontend owns *experience*. This means a contract bug can't leak private keys, and a backend bug can't corrupt onchain history.

---

## 2. Smart Contracts

### 2.1 `TravelerCredential.sol` (ERC-721)
- Mints one NFT per city visited, to the user's wallet
- Metadata on-chain: `country`, `city` only (no personal data)
- Mint function callable only by the backend's minter role (not directly by users, to control gas sponsorship and prevent spam-minting)
- No transfer restrictions needed initially, but consider soulbound (non-transferable) since these are personal travel history, not tradeable assets — **flagging this as a decision needed**

### 2.2 `ServiceRating.sol`
- Stores: wallet address (rater), service ID, rating value, optional short tag, timestamp
- Emits events for indexing (backend listens and aggregates for the Recommendations feed)
- No personal identity beyond wallet address — pseudonymous by design
- Rate-limiting consideration: cap ratings per wallet per day to prevent spam/gaming

### 2.3 `SessionPermission.sol` (the auto-sign scoping mechanism)
- Implements a limited permission grant: user wallet authorizes a session key that can **only** call `ServiceRating.submitRating()` — no other function, ever
- Permission has an expiry and is user-revocable at any time
- This is the most security-critical contract in the system — it's the difference between "auto-sign is safe" and "auto-sign is a blank check"
- **This contract needs the most audit attention.**

### 2.4 Platform gas fee
- 0.1 MON per rating transaction — implemented as a fee collected in `ServiceRating.submitRating()`, routed to a platform treasury address

---

## 3. Backend Services

### 3.1 Auth & Wallet Custody Service
- On signup: generates an embedded wallet for the user (recommend using an established provider — Privy, Dynamic, or Web3Auth — rather than building custodial key management from scratch; this is not a place to reinvent security)
- Private key material encrypted at rest, never exposed to frontend
- Exposes signing endpoints scoped by permission (manual-sign requests vs auto-sign session key requests)

### 3.2 Funding Relayer
- Tracks monthly sponsorship quota (first 20 new wallets/month → 2 MON auto-funded)
- Once quota is hit, flips new users to "please fund your wallet" flow
- Master wallet key held in a secrets manager (not in application code/env files) — this is a hard requirement, not optional, since this wallet holds real funds

### 3.3 Content API
- Serves City Guide + Local Help data (etiquette, neighborhoods, phrases, transport/fares, safety info, events, community tips)
- Structured as versioned per-city datasets so they can be downloaded/cached for offline use

### 3.4 Expense & Budget Service
- Off-chain database (expenses, budgets, group splits) — deliberately off-chain per earlier decision, this is personal financial data
- Currency conversion via a live exchange-rate API

### 3.5 OCR/Translation Proxy (Quick Scan)
- Receives scanned image → calls a vision/OCR API → translates extracted text → returns structured result
- Backend proxy (not direct frontend-to-vision-API calls) so API keys stay server-side

### 3.6 Rating Indexer
- Listens to `ServiceRating` contract events, aggregates into a queryable database for the Recommendations feed (so the app isn't doing live contract reads for every list view)

---

## 4. Frontend

Single React app, sections as previously scoped:
Landing, Wallet Login, Location/NFT Setup, Dashboard (budget snapshot, NFT collection, events, community tips, Quick Scan, quick-add expense), City Guide, Local Help, Money, Recommendations + Rating flow (Approve → Sign → Pushing to chain → Confirmed), Settings (auto-sign toggle, wallet balance, withdraw, revoke).

---

## 5. Security & Custody Checklist (non-negotiable before mainnet)

- [ ] Master wallet key in a secrets manager / HSM, never in code or plaintext config
- [ ] `SessionPermission.sol` scope tested against every non-rating function to confirm it truly can't be used for anything else
- [ ] Rate limits on wallet creation and funding relayer to prevent drain attacks
- [ ] Independent smart contract audit before mainnet deployment (even for "just gas," real funds = real risk)
- [ ] Withdrawal flow tested extensively — always manual sign, no code path that skips this
- [ ] Testnet deployment and real usage period before mainnet
- [ ] Monitoring/alerting on master wallet balance and unusual transaction patterns

---

## 6. Build Sequence

| Phase | What happens |
|---|---|
| 1. Prototype (now) | Full frontend, all flows working, chain layer simulated |
| 2. Contracts | Write + unit test `TravelerCredential`, `ServiceRating`, `SessionPermission` in Solidity |
| 3. Testnet | Deploy to Monad testnet, connect real frontend to real contracts, test with test MON |
| 4. Audit | Third-party review of contracts, especially session-permission scoping |
| 5. Mainnet | Deploy audited contracts, connect funding relayer with real master wallet, soft-launch with monitoring |

This session can fully deliver **Phase 1** (working prototype) and produce solid drafts for **Phase 2** (contract code, ready for testnet). Phases 3–5 require real deployment infrastructure and a funded wallet outside this environment, plus external audit — those aren't shortcuts worth skipping given this involves custody of user funds.

---

## Open Decisions Before Build
1. Should `TravelerCredential` NFTs be soulbound (non-transferable)?
2. Embedded wallet provider preference (Privy / Dynamic / Web3Auth / other)?
3. OCR/vision API preference for Quick Scan (or default recommendation is fine)?
