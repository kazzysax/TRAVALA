const express = require("express");
const { getCityRatings, getCityServiceAverage, getRaterCityRatings, getStampsByOwner, getStampsByCity } = require("../lib/db");
// Local copy of the same canonical helper used by content-api and the
// contracts test suite (contracts/hardhat/lib/cityId.js) - see that file's
// header comment for why the hashing logic must never be re-derived
// independently. Kept as a local copy rather than a cross-directory require
// because Render's per-service root-directory isolation breaks reaching
// outside a service's own deployed root (ethers isn't resolvable there).
const { toCityId } = require("../lib/cityId");

const router = express.Router();

router.get("/cities/:cityId/ratings", async (req, res) => {
  try {
    const { offset = 0, limit = 20 } = req.query;
    res.json(await getCityRatings(req.params.cityId, Number(offset), Number(limit)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/cities/:cityId/services/:serviceId/average", async (req, res) => {
  try {
    res.json(await getCityServiceAverage(req.params.cityId, req.params.serviceId));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/// The "check a stamp" read path: one wallet's ratings in one city only.
router.get("/wallets/:address/cities/:cityId/ratings", async (req, res) => {
  try {
    const { offset = 0, limit = 20 } = req.query;
    res.json(await getRaterCityRatings(req.params.address, req.params.cityId, Number(offset), Number(limit)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
router.get("/wallets/:address/stamps", async (req, res) => {
  try {
    const stamps = await getStampsByOwner(req.params.address);
    const withRatings = await Promise.all(
      stamps.map(async (stamp) => {
        const cityId = toCityId(stamp.city, stamp.country);
        const ratings = await getRaterCityRatings(req.params.address, cityId, 0, 50);
        return { ...stamp, cityId, ratings };
      })
    );
    res.json(withRatings);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/// The community showcase: every real traveler who has a stamp for this
/// city, each with their own real ratings in it - "who else has been here,
/// and what did they rate" (any service, not just restaurants).
router.get("/cities/:city/:country/stamps", async (req, res) => {
  try {
    const { city, country } = req.params;
    const cityId = toCityId(city, country);
    const stamps = await getStampsByCity(city, country);
    const withRatings = await Promise.all(
      stamps.map(async (stamp) => {
        const ratings = await getRaterCityRatings(stamp.owner, cityId, 0, 50);
        return { ...stamp, ratings };
      })
    );
    res.json(withRatings);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
