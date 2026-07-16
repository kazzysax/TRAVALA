const express = require("express");
const fs = require("fs");
const path = require("path");

// Reused directly from Stage 1's canonical helper rather than re-derived
// here, per the cityId lock-down decision (DEPLOY_TO_MAINNET.md #0: writers
// and readers must agree on this convention or city-scoped lookups silently
// return empty). This cross-directory require is fine within this
// single-repo prototype; a real deployment should hoist lib/cityId.js into
// a shared workspace package instead of reaching across service boundaries.
const { toCityId } = require("../../../../contracts/hardhat/lib/cityId");

const router = express.Router();
const DATA_DIR = path.join(__dirname, "..", "..", "data", "cities");

function listSlugs() {
  return fs.readdirSync(DATA_DIR).filter((entry) => fs.statSync(path.join(DATA_DIR, entry)).isDirectory());
}

function latestVersionFile(slug) {
  const dir = path.join(DATA_DIR, slug);
  const files = fs.readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f));
  if (files.length === 0) return undefined;
  files.sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
  return path.join(dir, files[files.length - 1]);
}

router.get("/cities", (_req, res) => {
  const cities = listSlugs().map((slug) => {
    const file = latestVersionFile(slug);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { slug, city: data.city, country: data.country, version: data.version };
  });
  res.json(cities);
});

/// Versioned so the frontend can cache a version number and only re-download
/// when it changes - the "downloadable/cacheable for offline use" requirement.
router.get("/cities/:slug", (req, res) => {
  const file = latestVersionFile(req.params.slug);
  if (!file) return res.status(404).json({ error: "city not found" });
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  res.set("ETag", `"${data.version}"`);
  res.json(data);
});

/// The onchain cityId for this city, using the exact same convention
/// ServiceRating/SessionPermission were tested against - lets the frontend
/// cross-link guide content with a city's onchain ratings feed.
router.get("/cities/:slug/city-id", (req, res) => {
  const file = latestVersionFile(req.params.slug);
  if (!file) return res.status(404).json({ error: "city not found" });
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  res.json({ cityId: toCityId(data.city, data.country) });
});

module.exports = router;
