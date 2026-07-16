const { keccak256, toUtf8Bytes } = require("ethers");

/// Canonical cityId convention (locked per DEPLOY_TO_MAINNET.md #0): each
/// field trimmed individually, joined as "city,country", lowercased, then
/// keccak256'd. Writers and readers (contracts, backend, frontend) MUST all
/// derive cityId this exact way, or city-scoped lookups silently return
/// empty results instead of erroring.
function toCityId(city, country) {
  const canonical = `${city.trim()},${country.trim()}`.toLowerCase();
  return keccak256(toUtf8Bytes(canonical));
}

/// Same convention applied to service identifiers (e.g. a slug like
/// "miguel-airport-transfer"): trimmed, lowercased, then keccak256'd. Keeps
/// city and service IDs derived the same consistent way everywhere.
function toServiceId(slug) {
  return keccak256(toUtf8Bytes(slug.trim().toLowerCase()));
}

module.exports = { toCityId, toServiceId };
