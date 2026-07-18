// Real persistent storage - Postgres, not in-memory. A restart (including
// Render free-tier spin-down/wake cycles) no longer wipes the index or
// forces a full re-backfill from START_BLOCK; only new blocks since the
// last synced one need to be processed, tracked in sync_state.

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  rater TEXT NOT NULL,
  city_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  rating_index INTEGER NOT NULL,
  value INTEGER NOT NULL,
  tag TEXT,
  timestamp BIGINT NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL,
  UNIQUE(tx_hash, rating_index)
);
CREATE INDEX IF NOT EXISTS idx_ratings_city ON ratings(city_id);
CREATE INDEX IF NOT EXISTS idx_ratings_city_service ON ratings(city_id, service_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rater_city ON ratings(LOWER(rater), city_id);

CREATE TABLE IF NOT EXISTS stamps (
  id SERIAL PRIMARY KEY,
  owner TEXT NOT NULL,
  token_id INTEGER NOT NULL UNIQUE,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  serial INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  tx_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stamps_owner ON stamps(LOWER(owner));

CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_block BIGINT NOT NULL,
  CHECK (id = 1)
);
`;

async function migrate() {
  await pool.query(SCHEMA);
}

async function ingest(rating) {
  await pool.query(
    `INSERT INTO ratings (rater, city_id, service_id, rating_index, value, tag, timestamp, block_number, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tx_hash, rating_index) DO NOTHING`,
    [
      rating.rater,
      rating.cityId,
      rating.serviceId,
      rating.ratingIndex,
      rating.value,
      rating.tag,
      rating.timestamp,
      rating.blockNumber,
      rating.txHash,
    ]
  );
}

function rowToRating(r) {
  return {
    rater: r.rater,
    cityId: r.city_id,
    serviceId: r.service_id,
    ratingIndex: r.rating_index,
    value: r.value,
    tag: r.tag,
    timestamp: Number(r.timestamp),
    blockNumber: Number(r.block_number),
    txHash: r.tx_hash,
  };
}

async function getCityRatings(cityId, offset, limit) {
  const { rows } = await pool.query(
    `SELECT * FROM ratings WHERE city_id = $1 ORDER BY id OFFSET $2 LIMIT $3`,
    [cityId, offset, limit]
  );
  return rows.map(rowToRating);
}

async function getCityServiceAverage(cityId, serviceId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(value), 0) AS avg FROM ratings WHERE city_id = $1 AND service_id = $2`,
    [cityId, serviceId]
  );
  const { count, avg } = rows[0];
  return { avg: count > 0 ? Math.round(Number(avg) * 100) : 0, count };
}

async function getRaterCityRatings(rater, cityId, offset, limit) {
  const { rows } = await pool.query(
    `SELECT * FROM ratings WHERE LOWER(rater) = LOWER($1) AND city_id = $2 ORDER BY id OFFSET $3 LIMIT $4`,
    [rater, cityId, offset, limit]
  );
  return rows.map(rowToRating);
}

async function ingestStamp(stamp) {
  await pool.query(
    `INSERT INTO stamps (owner, token_id, country, city, serial, block_number, tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (token_id) DO NOTHING`,
    [stamp.owner, stamp.tokenId, stamp.country, stamp.city, stamp.serial, stamp.blockNumber, stamp.txHash]
  );
}

function rowToStamp(r) {
  return {
    owner: r.owner,
    tokenId: r.token_id,
    country: r.country,
    city: r.city,
    serial: r.serial,
    blockNumber: Number(r.block_number),
    txHash: r.tx_hash,
  };
}

async function getStampsByOwner(owner) {
  const { rows } = await pool.query(`SELECT * FROM stamps WHERE LOWER(owner) = LOWER($1) ORDER BY token_id`, [owner]);
  return rows.map(rowToStamp);
}

/// Every real stamp minted for a given city, across all owners - this is
/// what a "who else has been here, and what did they rate" community
/// showcase reads from.
async function getStampsByCity(city, country) {
  const { rows } = await pool.query(
    `SELECT * FROM stamps WHERE LOWER(city) = LOWER($1) AND LOWER(country) = LOWER($2) ORDER BY token_id`,
    [city, country]
  );
  return rows.map(rowToStamp);
}

async function getLastSyncedBlock() {
  const { rows } = await pool.query(`SELECT last_block FROM sync_state WHERE id = 1`);
  return rows.length ? Number(rows[0].last_block) : null;
}

async function setLastSyncedBlock(blockNumber) {
  await pool.query(
    `INSERT INTO sync_state (id, last_block) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET last_block = $1`,
    [blockNumber]
  );
}

module.exports = {
  migrate,
  ingest,
  getCityRatings,
  getCityServiceAverage,
  getRaterCityRatings,
  ingestStamp,
  getStampsByOwner,
  getStampsByCity,
  getLastSyncedBlock,
  setLastSyncedBlock,
};
