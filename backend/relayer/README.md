# backend/relayer

Funding relayer: sponsors the first 20 new wallets/month with 2 MON each,
then flips new users to a "please self-fund" flow. Separate from - and much
higher-value than - the `SessionPermission` relayer key used for auto-sign
ratings in `backend/auth`: this service's key can move arbitrary amounts of
real MON, so it is the single most sensitive piece of the whole backend.

## Requires before this actually runs

- A funded master/treasury wallet and its private key, **in a secrets
  manager**, not this service's `.env` - see `DEPLOY_TO_MAINNET.md`'s
  security checklist, which calls this out as a hard requirement, not
  optional.
- A real database for the quota counter and funded-wallet set
  (`src/lib/quota.js` is in-memory right now and forgets state on restart,
  which would silently re-open the sponsorship quota).
- Monitoring/alerting on this wallet's balance and transaction volume before
  any real user reaches this endpoint, per the same checklist.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `POST /fund` `{ walletAddress }` -> sponsors 2 MON if quota remains and this wallet has never been funded before; otherwise returns `quota_exceeded` or `already_funded`
- `GET /quota` -> `{ limit, remaining }` for the current calendar month
