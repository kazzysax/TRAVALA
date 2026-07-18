# backend/indexer

Listens to `ServiceRating`'s `RatingSubmitted` events and `TravelerCredential`'s
`StampMinted` events, backfills history, and serves city/service/rater-scoped
reads plus per-wallet owned-stamp lookups from a real Postgres store - so the
Recommendations feed, stamp-check view, and "ratings linked to my NFT" flow
don't hit the chain on every list render (technical-plan.md 3.6).

## Requires before this actually runs

- Deployed `SERVICE_RATING_ADDRESS` and `TRAVELER_CREDENTIAL_ADDRESS` (from
  Stage 1's deploy output) and a Monad RPC URL.
- A real Postgres `DATABASE_URL`. Indexed data and the last-synced block are
  persisted here - a restart (including a free-tier spin-down/wake cycle)
  resumes from where it left off instead of re-backfilling from genesis.
- `START_BLOCK` set to the contracts' deployment block - only used on the
  very first run, before any sync state exists.

## Why Postgres, not in-memory

The first version of this service used an in-memory store. On Render's free
tier, an idle service spins down and wipes that entirely - every wake-up
re-ran the *entire* historical backfill, which only gets slower as the chain
grows, and left the service returning empty results for however long that
took. Confirmed in production: a single idle period turned into ~15 minutes
of no data before the reindex finished. Postgres with a persisted
last-synced-block fixes this at the root rather than just tolerating it.

## Note on Monad's public RPC

Two real, confirmed-in-production constraints shaped `src/lib/listener.js`:
- `eth_getLogs` is capped at a 100-block range per call, so backfill/polling
  chunk requests instead of one wide query.
- `eth_newFilter`/`eth_getFilterChanges` aren't implemented at all ("Method
  not found") - so this polls with `eth_getLogs` on an interval rather than
  using ethers' `contract.on(...)`, which depends on filters.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `GET /cities/:cityId/ratings?offset=&limit=` -> a city's rating feed
- `GET /cities/:cityId/services/:serviceId/average` -> `{ avg, count }` (avg x100, matching the contract's convention)
- `GET /wallets/:address/cities/:cityId/ratings?offset=&limit=` -> one wallet's ratings in one city only
- `GET /wallets/:address/stamps` -> every real stamp this wallet owns, each paired with that wallet's real ratings in that stamp's own city - the actual "ratings linked to NFT" answer
- `GET /city-id?city=Lisbon&country=Portugal` -> the onchain `cityId` for a human-readable city/country, using the same helper as `content-api` and the contract tests
- `POST /rpc` -> generic JSON-RPC proxy so the frontend can talk to Monad without needing the real RPC URL
