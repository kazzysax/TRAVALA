# ServiceRating.sol

Onchain, pseudonymous ratings for local services. Every rating carries a
**cityId** and a **serviceId**, which turns the rating data into a reusable
public resource: the next traveler to a city queries by cityId and reads real
ratings from people who were actually there. This is the flywheel — each rating
improves the experience for whoever visits that place next.

## What's verified in this session
- ✅ Compiles against real OpenZeppelin v5 (Solidity 0.8.24, evmVersion "cancun")
- ✅ **Executed on a real in-memory EVM** — deployed, submitted ratings, and
  read them back. All linkage assertions pass (see `test_rating.mjs`):
  - City-level counts correct (Lisbon 3, Tokyo 1)
  - City+service average correct (Miguel@Lisbon = 4.5)
  - **Same serviceId in a different city stays separate** (Miguel@Tokyo = 3.0,
    not mixed into Lisbon) — proves city scoping is real, not cosmetic
  - Per-wallet, per-city query returns exactly that city's ratings (the
    "check a stamp" view)
- ✅ ABI + artifact generated

## The city+service model

Each rating stores both IDs, and the contract maintains four lookup indexes:

| Index | Answers |
|---|---|
| `_ratingsByService` | a service's ratings across all cities |
| `_ratingsByCity` | everything rated in a city (the "what's it like here" feed) |
| `_ratingsByCityService` | one service *within* one city — the trustworthy average |
| `_ratingsByRaterCity` | one wallet's ratings *within* one city — the stamp view |

### "Check a stamp → see that city's ratings"

A `TravelerCredential` stamp is tied to a wallet + city. To render the stamp
view, the frontend/indexer:
1. reads the stamp's `city` (and the owner wallet)
2. computes `cityId = keccak256("City,Country")` (same scheme used on write)
3. calls `getRaterCityRatings(ownerWallet, cityId, offset, limit)`

That returns only what that traveler rated in that city — deliberately
city-scoped, per the product decision, so checking a stamp never exposes the
traveler's whole cross-city history.

### How a new arrival benefits

Someone landing in Lisbon reads aggregate city data — not tied to any one
traveler:
- `getCityServiceAverage(cityId, serviceId)` → "is this cab worth it here?"
- `getCityRatings(cityId, offset, limit)` → recent ratings across the city

## Notes for testnet
- `cityId` must be derived the *same way* on write and read (recommend a fixed
  canonical string like `"Lisbon,Portugal"` lowercased/trimmed, hashed with
  keccak256). Lock this convention down before launch or reads won't match writes.
- On-chain `getCityServiceAverage` loops over all ratings for that city+service.
  Fine for small/medium volume; for very popular services, compute the average
  off-chain from `RatingSubmitted` events (the indexer) instead of calling this
  view.
- Still needs a full Foundry/Hardhat suite (fee edge-cases, daily limit,
  relayer-only access) before mainnet, plus the audit already flagged.

## Files
- `ServiceRating.sol` — the contract
- `ServiceRating.abi.json` — compiled ABI
- `test_rating.mjs` — the EVM test harness (in project root)
