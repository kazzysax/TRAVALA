require("dotenv").config();
const express = require("express");

const signupRoutes = require("./routes/signup");
const sessionKeyRoutes = require("./routes/sessionKey");
const rateRoutes = require("./routes/rate");
const mintRoutes = require("./routes/mint");
const { startKeepAlive } = require("./lib/keepAlive");

const app = express();
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

app.use(signupRoutes);
app.use(sessionKeyRoutes);
app.use(rateRoutes);
app.use(mintRoutes);

/// The Privy App ID and Client ID are both meant to be public - they're
/// embedded in every Privy client-side SDK bundle by design (unlike
/// PRIVY_APP_SECRET, which never leaves this service). SESSION_PERMISSION_ADDRESS
/// is a deployed contract address, also public - the frontend needs it to
/// build the grantSession/revokeSession calls for the auto-sign toggle in
/// settings.html. Served here so none of this needs hardcoding per-page.
app.get("/config", (_req, res) => {
  res.json({
    privyAppId: process.env.PRIVY_APP_ID || null,
    privyClientId: process.env.PRIVY_CLIENT_ID || null,
    sessionPermissionAddress: process.env.SESSION_PERMISSION_ADDRESS || null,
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4001;
app.listen(port, () => {
  console.log(`auth service listening on :${port}`);
  startKeepAlive("https://auth-jtty.onrender.com");
});
