// Self-ping keep-alive: on Render's free tier a service sleeps after ~15min
// with no inbound traffic. Every 10 minutes, each Travala service pings
// every OTHER service's /health endpoint - a real public HTTPS round trip
// counts as inbound traffic (unlike an in-process call), so the cluster
// stays warm as long as at least one service in it is already awake. This
// does NOT wake a service that's already asleep: a sleeping process can't
// run this timer, so if every service goes idle at once, the whole cluster
// stays asleep until a real external request arrives.
//
// Duplicated per-service rather than shared, matching this repo's existing
// convention (see indexer/src/lib/cityId.js's header comment) - Render's
// per-service root-directory isolation means services can't require() each
// other's files anyway.
const SERVICES = [
  "https://auth-jtty.onrender.com",
  "https://relayer-rb93.onrender.com",
  "https://expense-17td.onrender.com",
  "https://ocr-w9bs.onrender.com",
  "https://indexer-y2zq.onrender.com",
  "https://content-api-zr40.onrender.com",
];

const PING_INTERVAL_MS = 10 * 60 * 1000;

function startKeepAlive(selfUrl) {
  const targets = SERVICES.filter((url) => url !== selfUrl);
  setInterval(() => {
    for (const url of targets) {
      fetch(`${url}/health`).catch(() => {}); // best-effort - one failed ping just leaves that service asleep this round
    }
  }, PING_INTERVAL_MS);
}

module.exports = { startKeepAlive };
