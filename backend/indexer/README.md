# backend/indexer

Listens to `ServiceRating`'s `RatingSubmitted` events, backfills history,
and serves the same city/service/rater-scoped reads as the contract itself
but from an indexed store - so the Recommendations feed and stamp-check view
don't hit the chain on every list render (technical-plan.md 3.6).

## Requires before this actually runs

- Deployed `SERVICE_RATING_ADDRESS` (from Stage 1's deploy output) and a
  Monad RPC URL.
- `START_BLOCK` set to the contract's deployment block, so backfill doesn't
  scan from genesis.
- A real database - `src/lib/db.js` is in-memory right now; a restart means
  a full re-backfill, which is fine for dev but wasteful against a busy
  mainnet contract long-term.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `GET /cities/:cityId/ratings?offset=&limit=` -> a city's rating feed
- `GET /cities/:cityId/services/:serviceId/average` -> `{ avg, count }` (avg x100, matching the contract's convention)
- `GET /wallets/:address/cities/:cityId/ratings?offset=&limit=` -> the "check a stamp" view: one wallet's ratings in one city only
- `GET /city-id?city=Lisbon&country=Portugal` -> the onchain `cityId` for a human-readable city/country, using the same helper as `content-api` and the contract tests
