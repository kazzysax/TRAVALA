# TravelerCredential.sol

Soulbound ERC-721 "city stamp" NFT. One minted per city a user sets as their
location in the app. Fully on-chain metadata and image — no IPFS/external
dependency.

## What's verified in this session
- ✅ Compiles successfully against real OpenZeppelin Contracts v5
- ✅ Solidity 0.8.24, `viaIR: true`, `evmVersion: "cancun"`
- ✅ ABI generated (`TravelerCredential.abi.json`)

## What's NOT yet done (needs your dev environment / testnet)
- No local runtime tests executed yet (mint → soulbound-transfer-reverts →
  tokenURI decode). Recommended next: Foundry or Hardhat test suite before
  testnet deployment.
- Not deployed anywhere. Deployment requires a funded wallet + RPC endpoint,
  which this environment doesn't have network access to.
- **Confirm Monad's EVM version support** matches `cancun` — if Monad's
  current EVM target is older (e.g., Shanghai), either wait for their
  Cancun support or refactor `Bytes.sol`-dependent OpenZeppelin usage /
  pin an OpenZeppelin version that doesn't require `mcopy`.

## Design decisions baked in
- **Soulbound**: `_update`, `approve`, and `setApprovalForAll` all revert
  except for the initial mint (transfer from `address(0)`). No burn function
  is exposed — add one deliberately if you want users to be able to remove
  a credential.
- **Minimal on-chain metadata**: only `country`, `city`, and a sequential
  `serial` number are stored. No personal data, timestamps, or wallet
  history beyond what's inherently public via token ownership.
- **Minter-gated**: only an address holding `MINTER_ROLE` (the backend
  service) can mint. Users can't mint arbitrary stamps directly — this
  keeps minting tied to actually completing location setup in the app, and
  lets the backend control gas sponsorship.
- **Collection name "NATIVE"** is placeholder branding baked into every
  stamp image — swap before deployment if you want a different name.

## Files
- `TravelerCredential.sol` — the contract
- `TravelerCredential.abi.json` — compiled ABI (generated, gitignore-able,
  regenerate via `compile.js`)
