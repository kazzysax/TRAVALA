const express = require("express");
const { getCityRatings, getCityServiceAverage, getRaterCityRatings } = require("../lib/db");
// Same canonical helper as content-api and the contracts test suite - see
// the note in contracts/hardhat/lib/cityId.js for why this must never be
// re-derived independently.
const { toCityId } = require("../../../../contracts/hardhat/lib/cityId");

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

module.exports = router;
