const express = require("express");
const { findNearbyServices } = require("../lib/places");
const { toServiceId } = require("../lib/cityId");

const router = express.Router();

/// Real nearby restaurants/cabs/cafes, each carrying the exact serviceId
/// ServiceRating.sol expects - so rating one of these from recommendations.html
/// writes onchain against the same identifier this endpoint returns, and the
/// indexer's per-service average reads back correctly.
router.get("/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radius = req.query.radius ? Number(req.query.radius) : undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: "lat and lon query params required" });
    }

    const places = await findNearbyServices(lat, lon, radius);
    const withServiceIds = places.map((p) => ({ ...p, serviceId: toServiceId(p.slug) }));
    res.json(withServiceIds);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
