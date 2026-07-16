# backend/content-api

Serves City Guide + Local Help data (etiquette, neighborhoods, phrases,
transport fares, emergency numbers, scams) as versioned per-city JSON, so the
frontend can cache/download it for offline use per the product spec.

No external credentials required - this is the one service in `backend/`
that's actually runnable end-to-end today, since content is static JSON
checked into `data/cities/`.

## Run locally

```bash
npm install
npm start
```

## Endpoints

- `GET /cities` -> list of available cities with slug/version
- `GET /cities/:slug` -> full versioned content for that city
- `GET /cities/:slug/city-id` -> the onchain `cityId` (keccak256, same convention as the contracts) for cross-linking with ratings

## Adding a new city

Add `data/cities/<slug>/v1.json` following `lisbon-portugal/v1.json`'s shape.
Bump to `v2.json` (don't edit `v1.json` in place) when content changes, so
clients that cached `v1` know to refetch.
