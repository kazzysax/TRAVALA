# Travala — Project Description

A city-guide, local-help, and money-tracking travel app with onchain,
tamper-proof service ratings, built on Monad. Wallets are created
automatically for users (no seed phrase); each city a traveler visits mints
them a soulbound NFT "stamp"; ratings left on real cabs, restaurants, and
stays are written onchain so the next traveler to that city can trust them.

## What's in this package

```
travala-project/
├── DESCRIPTION.md          ← this file
├── DEPLOY_TO_MAINNET.md    ← honest, step-by-step path from here to mainnet
├── technical-plan.md       ← full architecture: frontend, backend, onchain
├── contracts/
│   ├── TravelerCredential.sol      soulbound city-stamp NFT (ERC-721)
│   ├── TravelerCredential.abi.json
│   ├── ServiceRating.sol           onchain ratings, city+service scoped
│   ├── ServiceRating.abi.json
│   ├── test_rating.mjs             EVM test harness (passing, see below)
│   ├── README.md                   TravelerCredential notes
│   └── ServiceRating_README.md     ServiceRating notes
└── travala/                 full clickable frontend prototype
    ├── index.html            landing page
    ├── login.html            wallet auto-creation + location/NFT mint
    ├── dashboard.html        budget, stamps, events, tips, quick scan
    ├── guide.html            city guide (etiquette, neighborhoods, phrases…)
    ├── help.html             translator, fair fares, emergency, scams
    ├── money.html            expenses, budget, fair-price flag
    ├── recommendations.html  rate a service → approve → sign → onchain
    ├── settings.html         auto-sign toggle, wallet, withdraw, revoke
    └── stamp.html            check a stamp → see that traveler's city ratings
```

## Product summary

**Three problems, one app:**
1. **Fitting in** — City Guide: etiquette, neighborhoods, daily rhythms, real
   local phrases.
2. **Getting help fast** — Local Help: survival translator, fair transport
   fares, emergency numbers, common scams, all downloadable offline.
3. **Staying in control of money** — expense tracking with currency
   conversion, budget bars, and a fair-price flag tied to local price data.

**The onchain layer** turns service ratings into a durable public good:
- Each city visited mints a **soulbound** (non-transferable) NFT stamp,
  metadata limited to country + city + serial number.
- Ratings carry both a **cityId** and **serviceId**, so a rating is scoped to
  the place it was given — the same taxi company rated in two different
  cities produces two independent reputations, not one blended average.
- **Check a stamp → see that traveler's services and ratings in that one
  city** — implemented and verified against the real read path
  (`getRaterCityRatings`).
- Manual signing is the default for every onchain action; auto-sign is
  strictly ratings-only and off by default; withdrawals always require a
  manual signature, no exceptions.
- Platform gas fee: 0.1 MON per rating, refunding any overpayment.
- First 20 wallets each calendar month get 2 MON sponsored by the platform;
  everyone else is prompted to self-fund at least 2 MON, with an onscreen
  reminder that ~50 MON is more than enough.

## What's verified vs. what's simulated

| Layer | Status |
|---|---|
| Frontend (8 screens) | Fully built, fully clickable, cross-linked, screenshot-reviewed |
| `TravelerCredential.sol` | Compiles clean against real OpenZeppelin v5 |
| `ServiceRating.sol` | Compiles clean **and executes correctly on a real in-memory EVM** — city/service scoping, averages, and the stamp-rating lookup were run and asserted, see `test_rating.mjs` output |
| Onchain calls in the frontend (minting, signing, tx hashes) | Simulated with realistic timing — not connected to a live chain |
| Backend (auth, funding relayer, indexer, OCR proxy) | Designed in `technical-plan.md`, not implemented — needs real infrastructure |
| Deployment, audit, mainnet | Not done — see `DEPLOY_TO_MAINNET.md` for the honest path there |

## Brand

Wordmark: lowercase `travala` with a coral dot accent. App icon: lowercase
`t` with the same dot. Palette: ink `#222018`, coral `#E8622E`, cream
`#F7F5EF`, teal `#2F9E8F` (secondary/onchain-confirmation accent).
