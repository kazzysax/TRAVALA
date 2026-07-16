// REQUIRES: swap for a real database before production - an in-memory store
// means a service restart means a full re-backfill from START_BLOCK, which
// is fine for dev but wasteful and slow against a busy mainnet contract.

const ratings = []; // flat list, insertion order == ratingIndex order
const byCity = new Map(); // cityId -> ratings[] indices
const byCityService = new Map(); // `${cityId}:${serviceId}` -> indices
const byRaterCity = new Map(); // `${rater}:${cityId}` -> indices

function pushIndex(map, key, idx) {
  const list = map.get(key) || [];
  list.push(idx);
  map.set(key, list);
}

function ingest(rating) {
  const idx = ratings.length;
  ratings.push(rating);
  pushIndex(byCity, rating.cityId, idx);
  pushIndex(byCityService, `${rating.cityId}:${rating.serviceId}`, idx);
  pushIndex(byRaterCity, `${rating.rater.toLowerCase()}:${rating.cityId}`, idx);
}

function paginate(indices, offset, limit) {
  return indices.slice(offset, offset + limit).map((i) => ratings[i]);
}

function getCityRatings(cityId, offset, limit) {
  return paginate(byCity.get(cityId) || [], offset, limit);
}

function getCityServiceAverage(cityId, serviceId) {
  const indices = byCityService.get(`${cityId}:${serviceId}`) || [];
  if (indices.length === 0) return { avg: 0, count: 0 };
  const sum = indices.reduce((s, i) => s + ratings[i].value, 0);
  return { avg: Math.round((sum / indices.length) * 100), count: indices.length };
}

function getRaterCityRatings(rater, cityId, offset, limit) {
  return paginate(byRaterCity.get(`${rater.toLowerCase()}:${cityId}`) || [], offset, limit);
}

module.exports = { ingest, getCityRatings, getCityServiceAverage, getRaterCityRatings, all: () => ratings };
