const express = require("express");
const { getCityRatings, getCityServiceAverage, getRaterCityRatings, getStampsByOwner } = require("../lib/db");
// Local copy of the same canonical helper used by content-api and the
// contracts test suite (contracts/hardhat/lib/cityId.js) - see that file's
// header comment for why the hashing logic must never be re-derived
// independently. Kept as a local copy rather than a cross-directory require
// because Render's per-service root-directory isolation breaks reaching
// outside a service's own deployed root (ethers isn't resolvable there).
const { toCityId } = require("../lib/cityId");

const router = express.Router();

router.get("/cities/:cityId/ratings", (req, res) => {
  const { offset = 0, limit = 20 } = req.query;
  res.json(getCityRatings(req.params.cityId, Number(offset), Number(limit)));
});

router.get("/cities/:cityId/services/:serviceId/average", (req, res) => {
  res.json(getCityServiceAverage(req.params.cityId, req.params.serviceId));
});

/// The "check a stamp" read path: one wallet's ratings in one city only.
router.get("/wallets/:address/cities/:cityId/ratings", (req, res) => {
  const { offset = 0, limit = 20 } = req.query;
  res.json(getRaterCityRatings(req.params.address, req.params.cityId, Number(offset), Number(limit)));
});

/// Convenience: look up a cityId from human-readable city/country, so the
/// frontend doesn't need its own copy of the hashing convention.
router.get("/city-id", (req, res) => {
  const { city, country } = req.query;
  if (!city || !country) return res.status(400).json({ error: "city and country query params required" });
  res.json({ cityId: toCityId(city, country) });
});

/// The actual "ratings linked to NFT" answer: every real TravelerCredential
/// stamp this wallet owns (from indexed StampMinted events), each paired
/// with that same wallet's real ratings in that stamp's own city - not a
/// city typed in by hand, but the city the NFT itself was minted for.
router.get("/wallets/:address/stamps", (req, res) => {
  const stamps = getStampsByOwner(req.params.address);
  const withRatings = stamps.map((stamp) => {
    const cityId = toCityId(stamp.city, stamp.country);
    const ratings = getRaterCityRatings(req.params.address, cityId, 0, 50);
    return { ...stamp, cityId, ratings };
  });
  res.json(withRatings);
});

module.exports = router;
