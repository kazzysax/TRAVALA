require("dotenv").config();
const express = require("express");

const signupRoutes = require("./routes/signup");
const sessionKeyRoutes = require("./routes/sessionKey");
const rateRoutes = require("./routes/rate");

const app = express();
app.use(express.json());

app.use(signupRoutes);
app.use(sessionKeyRoutes);
app.use(rateRoutes);

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 4001;
app.listen(port, () => console.log(`auth service listening on :${port}`));
