# Deploying Travala's Contracts to Monad Mainnet

This is the real, honest path from what's in this package to a live mainnet
deployment. **Nothing in this package has been deployed anywhere.** This
environment has no blockchain RPC access, so every step below has to be run
from your own machine or CI.

Read the whole thing before running anything — the order matters, especially
the audit step, since this involves a custodial wallet holding real user
funds.

---

## 0. Do not skip: prerequisites before you deploy anywhere

- [ ] **Confirm Monad's current EVM version target.** Both contracts compile
      with `evmVersion: "cancun"` (needed for OpenZeppelin's `mcopy` usage).
      If Monad mainnet/testnet is on an earlier EVM version, either wait for
      Cancun support or pin an older OpenZeppelin release that avoids it.
- [ ] **Decide the `cityId` hashing convention** and lock it everywhere
      (contracts, backend, frontend). Recommended: lowercase, trimmed
      `"city,country"` string, hashed with `keccak256`. If writers and
      readers ever disagree on this convention, city-scoped lookups silently
      return empty results — this is the single easiest thing to get wrong.
- [ ] **Write a full test suite.** `test_rating.mjs` in this package proves
      the core city/service linkage logic works, but it is not a substitute
      for a real Foundry or Hardhat suite covering: fee edge cases (exact
      fee, underpayment, overpayment/refund), the daily rate limit, soulbound
      transfer-block on every code path, relayer-only access control, and
      admin function access control.
- [ ] **Get an independent smart contract audit**, specifically scrutinizing:
      the `SessionPermission`-style auto-sign scoping (not yet built — see
      technical-plan.md), the relayer's ability to call `submitRatingFor`,
      and the master wallet / funding relayer's key custody. This is not
      optional for a contract that will hold or move real user funds, even
      small amounts of gas token.
- [ ] **Deploy to testnet first and use it for real**, ideally for a couple
      of weeks with real (test) traffic, before touching mainnet.

---

## 1. Local environment setup

```bash
mkdir travala-contracts && cd travala-contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
npx hardhat init   # choose "Create a JavaScript project"
```

Copy `TravelerCredential.sol` and `ServiceRating.sol` from the `contracts/`
folder in this package into `contracts/` in your new Hardhat project.

`hardhat.config.js`:

```js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",   // confirm this matches Monad's support — see step 0
      viaIR: true,             // required: TravelerCredential's on-chain SVG hits stack-too-deep otherwise
    },
  },
  networks: {
    monadTestnet: {
      url: process.env.MONAD_TESTNET_RPC_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
    monadMainnet: {
      url: process.env.MONAD_MAINNET_RPC_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY],
    },
  },
};
```

`.env` (never commit this file):

```
MONAD_TESTNET_RPC_URL=<Monad testnet RPC endpoint>
MONAD_MAINNET_RPC_URL=<Monad mainnet RPC endpoint>
DEPLOYER_PRIVATE_KEY=<deployer wallet private key — see key management note below>
```

**Key management note:** for testnet this can be a throwaway `.env` key. For
mainnet, the deployer key and especially the master/treasury wallet key
should live in a secrets manager (e.g. AWS Secrets Manager, GCP Secret
Manager, or a hardware wallet for the deployer transaction itself) — not in
a `.env` file on a server.

---

## 2. Deploy script

`scripts/deploy.js`:

```js
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // --- TravelerCredential ---
  const Credential = await hre.ethers.getContractFactory("TravelerCredential");
  const credential = await Credential.deploy(deployer.address); // admin
  await credential.waitForDeployment();
  console.log("TravelerCredential deployed to:", await credential.getAddress());

  // --- ServiceRating ---
  const treasuryAddress = process.env.TREASURY_ADDRESS || deployer.address;
  const Rating = await hre.ethers.getContractFactory("ServiceRating");
  const rating = await Rating.deploy(deployer.address, treasuryAddress);
  await rating.waitForDeployment();
  console.log("ServiceRating deployed to:", await rating.getAddress());

  // --- wire up roles ---
  // Grant your backend minter service the MINTER_ROLE on TravelerCredential
  const MINTER_ROLE = await credential.MINTER_ROLE();
  await credential.grantRole(MINTER_ROLE, process.env.BACKEND_MINTER_ADDRESS);
  console.log("Granted MINTER_ROLE to backend minter service");

  // Grant your backend relayer the RELAYER_ROLE on ServiceRating,
  // for the auto-sign path (see technical-plan.md — build SessionPermission
  // first if you want this scoped by a contract rather than an EOA)
  const RELAYER_ROLE = await rating.RELAYER_ROLE();
  await rating.grantRelayer(process.env.BACKEND_RELAYER_ADDRESS);
  console.log("Granted RELAYER_ROLE to backend relayer");

  console.log("\nDone. Save these addresses — your backend needs them:");
  console.log("TRAVELER_CREDENTIAL_ADDRESS=", await credential.getAddress());
  console.log("SERVICE_RATING_ADDRESS=", await rating.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## 3. Testnet deployment

```bash
npx hardhat run scripts/deploy.js --network monadTestnet
```

Then:
- Fund the deployer/master wallet with testnet MON from a faucet.
- Connect your frontend to the deployed testnet addresses (swap the
  simulated chain calls in the prototype for real `ethers`/`viem` calls
  against these contracts).
- Run through the whole flow for real: mint a stamp, submit a rating, check
  a stamp's city ratings, withdraw. Confirm gas costs are what you expect.
- Let this run for real testnet usage before moving on — this is where bugs
  surface that unit tests miss.

---

## 4. Mainnet deployment

Only after: tests pass, audit findings are resolved, testnet has run
successfully for a meaningful period.

```bash
npx hardhat run scripts/deploy.js --network monadMainnet
```

After deployment:
- **Verify the contracts** on Monad's block explorer (exact command depends
  on whether Monad uses a Sourcify/Etherscan-compatible verification API —
  check their current docs).
- Transfer `DEFAULT_ADMIN_ROLE` on both contracts to a multisig, not a
  single EOA, if you haven't already deployed with a multisig as admin.
- Set up **monitoring/alerting** on the treasury and master wallet balances
  and on unusual transaction volume, before any real users touch it.
- Keep the deployer private key's usage minimal after deployment — most
  ongoing admin actions (fee changes, relayer grants) should go through the
  multisig, not the original deployer key.

---

## 5. What still needs building before this is a complete product

Per `technical-plan.md`:
- `SessionPermission.sol` — the contract that scopes auto-sign to ratings
  only at the contract level, not just in app logic. Not yet built.
- The backend: auth/wallet custody service, funding relayer, content API,
  expense database, OCR/translation proxy, rating indexer. Design only.
- Connecting the frontend's simulated wallet/chain calls to real ones.

None of these are optional for a production launch — they're the difference
between a convincing prototype and a real product handling real funds.
