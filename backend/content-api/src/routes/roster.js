const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ROSTER_PATH = path.join(__dirname, "..", "..", "data", "city-roster.json");

function humanizeKey(key) {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/// Flattens the verified master roster into a frontend-friendly list, one
/// entry per city, carrying the exact city/country pair used for cityId
/// hashing (cityId_source_string when the roster provides one - it's not
/// always identical to the continent/country grouping key, e.g. "Hong Kong
/// SAR" vs the map key "Hong Kong SAR, China"). Login.html's picker is built
/// from this, and persists exactly this city/country pair, so every other
/// page's cityId computation lines up with what this roster intended.
function flattenRoster() {
  const roster = JSON.parse(fs.readFileSync(ROSTER_PATH, "utf8"));
  const cities = [];

  for (const [continent, countries] of Object.entries(roster.continents)) {
    for (const [countryKey, entries] of Object.entries(countries)) {
      for (const entry of entries) {
        let city = entry.city;
        let country = countryKey;
        if (entry.cityId_source_string) {
          const [srcCity, srcCountry] = entry.cityId_source_string.split(",").map((s) => s.trim());
          if (srcCity) city = srcCity;
          if (srcCountry) country = srcCountry;
        }
        const slug = `${city}-${country}`.toLowerCase().trim().replace(/\s+/g, "-");
        cities.push({
          continent,
          countryGroup: countryKey,
          city,
          country,
          slug,
          rankGlobalArrivals: entry.rank_global_arrivals,
          researched: !!entry.researched,
        });
      }
    }
  }
  return cities;
}

router.get("/roster", (_req, res) => {
  try {
    res.json(flattenRoster());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, flattenRoster, humanizeKey };
