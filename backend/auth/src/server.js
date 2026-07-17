require("dotenv").config();
const express = require("express");

const signupRoutes = require("./routes/signup");
const sessionKeyRoutes = require("./routes/sessionKey");
const rateRoutes = require("./routes/rate");

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

/// The Privy App ID is meant to be public - it's embedded in every Privy
/// client-side SDK bundle by design. Served here so the frontend never needs
/// it hardcoded, and so it never has to be typed anywhere sensitive.
app.get("/config", (_req, res) => {
  res.json({ privyAppId: process.env.PRIVY_APP_ID || null });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4001;
app.listen(port, () => console.log(`auth service listening on :${port}`));
