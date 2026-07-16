const { ethers } = require("ethers");
const { ingest } = require("./db");

const RATING_SUBMITTED_ABI = [
  "event RatingSubmitted(address indexed rater, bytes32 indexed cityId, bytes32 indexed serviceId, uint256 ratingIndex, uint8 value, string tag, uint64 timestamp)",
];

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

/// Backfills every RatingSubmitted event since START_BLOCK, then subscribes
/// to new ones live - this is the entire point of the indexer
/// (technical-plan.md 3.6): the Recommendations feed reads from here, not
/// from live contract calls on every list view.
async function startListening() {
  const { MONAD_RPC_URL, SERVICE_RATING_ADDRESS, START_BLOCK } = process.env;
  if (!MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set - see .env.example");
  if (!SERVICE_RATING_ADDRESS) throw new Error("SERVICE_RATING_ADDRESS not set - see .env.example");

  const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
  const contract = new ethers.Contract(SERVICE_RATING_ADDRESS, RATING_SUBMITTED_ABI, provider);

  const startBlock = Number(START_BLOCK || 0);
  const latestBlock = await provider.getBlockNumber();
  console.log(`Backfilling RatingSubmitted from block ${startBlock} to ${latestBlock}...`);

  const pastEvents = await contract.queryFilter(contract.filters.RatingSubmitted(), startBlock, latestBlock);
  for (const event of pastEvents) ingest(eventToRating(event));
  console.log(`Backfilled ${pastEvents.length} ratings.`);

  contract.on("RatingSubmitted", (...args) => {
    const event = args[args.length - 1];
    ingest(eventToRating(event));
  });
  console.log("Listening for new RatingSubmitted events...");
}

module.exports = { startListening };
