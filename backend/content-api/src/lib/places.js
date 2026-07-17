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

async function findNearbyServices(lat, lon, radiusMeters = 1500) {
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
  if (!res.ok) throw new Error(`Overpass API failed: ${res.status}`);

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
