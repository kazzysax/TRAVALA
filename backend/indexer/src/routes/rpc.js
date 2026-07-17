const express = require("express");

const router = express.Router();

/// Generic JSON-RPC proxy so the frontend can talk to Monad without ever
/// knowing the real (private) MONAD_RPC_URL - the browser posts a standard
/// JSON-RPC body here, it gets relayed as-is. Read-only calls (eth_call,
/// eth_getBalance, etc.) and real signed-transaction submission
/// (eth_sendRawTransaction) both just pass through - the private key never
/// leaves the browser, only the already-signed raw transaction does.
router.post("/rpc", async (req, res) => {
  try {
    if (!process.env.MONAD_RPC_URL) throw new Error("MONAD_RPC_URL not set");
    const upstream = await fetch(process.env.MONAD_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
