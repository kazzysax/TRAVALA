const { ethers } = require("ethers");
const { ingest, ingestStamp } = require("./db");

const RATING_SUBMITTED_ABI = [
  "event RatingSubmitted(address indexed rater, bytes32 indexed cityId, bytes32 indexed serviceId, uint256 ratingIndex, uint8 value, string tag, uint64 timestamp)",
];
const STAMP_MINTED_ABI = [
  "event StampMinted(address indexed to, uint256 indexed tokenId, string country, string city, uint256 serial)",
];

const CHUNK = 100; // Monad's public RPC caps eth_getLogs at a 100-block range
const CONCURRENCY = 20;
const POLL_INTERVAL_MS = 8000;

function eventToRating(event) {
  const { rater, cityId, serviceId, ratingIndex, value, tag, timestamp } = event.args;
  return {
    rater,
    cityId,
    serviceId,
    ratingIndex: Number(ratingIndex),
    value: Number(value),
    tag,
    timestamp: Number(timestamp),
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
  };
}

function eventToStamp(event) {
  const { to, tokenId, country, city, serial } = event.args;
  return {
    owner: to,
    tokenId: Number(tokenId),
    country,
    city,
    serial: Number(serial),
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
  };
}

async function fetchRange(contract, eventFilter, from, to, onEvent) {
  const ranges = [];
  for (let b = from; b <= to; b += CHUNK) ranges.push([b, Math.min(b + CHUNK - 1, to)]);

  let count = 0;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(([f, t]) => contract.queryFilter(eventFilter, f, t)));
    for (const events of results) {
      for (const event of events) onEvent(event);
      count += events.length;
    }
  }
  return count;
}

/// Backfills and then keeps polling for both RatingSubmitted (ServiceRating)
/// and StampMinted (TravelerCredential) events - indexing both is what lets
/// a wallet's real owned stamps be linked to that same wallet's real
/// ratings in the same city (technical-plan.md 3.6's "check a stamp" flow).
///
/// Deliberately NOT using ethers' contract.on(...): that relies on
/// eth_newFilter/eth_getFilterChanges, which Monad's public RPC doesn't
/// implement at all ("Method not found", confirmed in production). Manual
/// polling with eth_getLogs (chunked, since Monad's public RPC also caps
/// eth_getLogs at a 100-block range) is the only reliable option here.
async function startListening() {
  const { MONAD_RPC_URL, SERVICE_RATING_ADDRESS, TRAVELER_CREDENTIAL_ADDRESS, START_BLOCK } = process.env;
  if (!MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set - see .env.example");
  if (!SERVICE_RATING_ADDRESS) throw new Error("SERVICE_RATING_ADDRESS not set - see .env.example");

  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  const rating = new ethers.Contract(SERVICE_RATING_ADDRESS, RATING_SUBMITTED_ABI, provider);
  const credential = TRAVELER_CREDENTIAL_ADDRESS
    ? new ethers.Contract(TRAVELER_CREDENTIAL_ADDRESS, STAMP_MINTED_ABI, provider)
    : null;
  if (!credential) {
    console.log("TRAVELER_CREDENTIAL_ADDRESS not set - stamp indexing disabled, ratings indexing still runs.");
  }

  const startBlock = Number(START_BLOCK || 0);
  const latestBlock = await provider.getBlockNumber();
  console.log(`Backfilling from block ${startBlock} to ${latestBlock}...`);

  const ratingsBackfilled = await fetchRange(rating, rating.filters.RatingSubmitted(), startBlock, latestBlock, (e) =>
    ingest(eventToRating(e))
  );
  console.log(`Backfilled ${ratingsBackfilled} ratings.`);

  if (credential) {
    const stampsBackfilled = await fetchRange(
      credential,
      credential.filters.StampMinted(),
      startBlock,
      latestBlock,
      (e) => ingestStamp(eventToStamp(e))
    );
    console.log(`Backfilled ${stampsBackfilled} stamps.`);
  }

  let lastPolledBlock = latestBlock;
  console.log("Polling for new events...");
  setInterval(async () => {
    try {
      const current = await provider.getBlockNumber();
      if (current > lastPolledBlock) {
        const newRatings = await fetchRange(rating, rating.filters.RatingSubmitted(), lastPolledBlock + 1, current, (e) =>
          ingest(eventToRating(e))
        );
        if (newRatings > 0) console.log(`Indexed ${newRatings} new rating(s) up to block ${current}.`);

        if (credential) {
          const newStamps = await fetchRange(
            credential,
            credential.filters.StampMinted(),
            lastPolledBlock + 1,
            current,
            (e) => ingestStamp(eventToStamp(e))
          );
          if (newStamps > 0) console.log(`Indexed ${newStamps} new stamp(s) up to block ${current}.`);
        }
        lastPolledBlock = current;
      }
    } catch (err) {
      console.error("Poll error (will retry next interval):", err.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { startListening };
