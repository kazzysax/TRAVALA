const { ethers } = require("ethers");
const { ingest } = require("./db");

const RATING_SUBMITTED_ABI = [
  "event RatingSubmitted(address indexed rater, bytes32 indexed cityId, bytes32 indexed serviceId, uint256 ratingIndex, uint8 value, string tag, uint64 timestamp)",
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

async function fetchRange(contract, from, to) {
  const ranges = [];
  for (let b = from; b <= to; b += CHUNK) ranges.push([b, Math.min(b + CHUNK - 1, to)]);

  let count = 0;
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const batch = ranges.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(([f, t]) => contract.queryFilter(contract.filters.RatingSubmitted(), f, t))
    );
    for (const events of results) {
      for (const event of events) ingest(eventToRating(event));
      count += events.length;
    }
  }
  return count;
}

/// Backfills every RatingSubmitted event since START_BLOCK, then keeps
/// polling for new ones - this is the entire point of the indexer
/// (technical-plan.md 3.6): the Recommendations feed reads from here, not
/// from live contract calls on every list view.
///
/// Deliberately NOT using ethers' contract.on(...) for live events: that
/// relies on eth_newFilter/eth_getFilterChanges, which Monad's public RPC
/// doesn't implement at all ("Method not found"). Manual polling with
/// eth_getLogs (the same call the backfill uses, which does work) is the
/// only reliable option against this endpoint.
async function startListening() {
  const { MONAD_RPC_URL, SERVICE_RATING_ADDRESS, START_BLOCK } = process.env;
  if (!MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set - see .env.example");
  if (!SERVICE_RATING_ADDRESS) throw new Error("SERVICE_RATING_ADDRESS not set - see .env.example");

  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  const contract = new ethers.Contract(SERVICE_RATING_ADDRESS, RATING_SUBMITTED_ABI, provider);

  const startBlock = Number(START_BLOCK || 0);
  const latestBlock = await provider.getBlockNumber();
  console.log(`Backfilling RatingSubmitted from block ${startBlock} to ${latestBlock}...`);
  const backfilled = await fetchRange(contract, startBlock, latestBlock);
  console.log(`Backfilled ${backfilled} ratings.`);

  let lastPolledBlock = latestBlock;
  console.log("Polling for new RatingSubmitted events...");
  setInterval(async () => {
    try {
      const current = await provider.getBlockNumber();
      if (current > lastPolledBlock) {
        const found = await fetchRange(contract, lastPolledBlock + 1, current);
        if (found > 0) console.log(`Indexed ${found} new rating(s) up to block ${current}.`);
        lastPolledBlock = current;
      }
    } catch (err) {
      console.error("Poll error (will retry next interval):", err.message);
    }
  }, POLL_INTERVAL_MS);
}

module.exports = { startListening };
