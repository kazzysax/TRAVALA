// Real nearby restaurants/taxis via OpenStreetMap's Overpass API - free,
// no key, no billing. Trade-off vs Google Places/Foursquare: coverage and
// attribute richness (hours, photos, ratings) vary by region, but the data
// is real, not simulated.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

function buildQuery(lat, lon, radiusMeters) {
  return `[out:json][timeout:25];
(
  node["amenity"="restaurant"](around:${radiusMeters},${lat},${lon});
  node["amenity"="taxi"](around:${radiusMeters},${lat},${lon});
  node["amenity"="cafe"](around:${radiusMeters},${lat},${lon});
);
out body;`;
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

// Overpass's public instance is fair-use rate-limited per IP and, when a
// caller is near that limit, tends to silently stall/504 rather than reject
// cleanly - the same query from a fresh IP routinely succeeds in ~2s. A
// short retry absorbs that transient case instead of failing every rating
// lookup the first time Render's shared egress IP gets throttled.
async function fetchOverpass(lat, lon, radiusMeters, attempt = 1) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "TravalaContentAPI/1.0 (+https://travala-io.onrender.com)",
    },
    body: `data=${encodeURIComponent(buildQuery(lat, lon, radiusMeters))}`,
  });
  if (!res.ok) {
    if (attempt < 3) {
      await sleep(1000 * attempt);
      return fetchOverpass(lat, lon, radiusMeters, attempt + 1);
    }
    throw new Error(`Overpass API failed: ${res.status}`);
  }
  return res;
}

async function findNearbyServices(lat, lon, radiusMeters = 1500) {
  const res = await fetchOverpass(lat, lon, radiusMeters);
  const data = await res.json();
  return data.elements
    .filter((el) => el.tags && el.tags.name)
    .map((el) => ({
      osmId: el.id,
      name: el.tags.name,
      category: el.tags.amenity,
      lat: el.lat,
      lon: el.lon,
      address: [el.tags["addr:street"], el.tags["addr:housenumber"]].filter(Boolean).join(" ") || null,
      // Stable slug for this specific place, independent of search radius/order,
      // so the same real-world business always maps to the same onchain serviceId.
      slug: `osm-${el.tags.amenity}-${el.id}`,
    }));
}

module.exports = { findNearbyServices };
