# backend/expense

Off-chain expense tracking, budgets, and group splits (deliberately off-chain
- this is personal financial data, per technical-plan.md 3.4). Currency
conversion is live via an external exchange-rate API.

## Requires before this actually runs

- An exchange-rate API (`EXCHANGE_RATE_API_BASE_URL`, `EXCHANGE_RATE_API_KEY`)
  - see `src/lib/currency.js` for the expected request/response shape and
    which field to adjust for your chosen provider.
- A real database - `src/lib/db.js` is in-memory right now (zero-setup
  scaffold); swap before real users, since this is personal financial data
  that must not vanish on restart.

## Run locally

```bash
npm install
cp .env.example .env   # fill in what you have; delete .env when you're done with it
npm start
```

## Endpoints

- `PUT /users/:userId/budget` `{ dailyBudget, homeCurrency }`
- `GET /users/:userId/budget`
- `POST /users/:userId/expenses` `{ amount, currency, category, note }` -> converts to home currency, stores, returns the entry
- `GET /users/:userId/expenses`
- `GET /users/:userId/budget-status` -> `{ dailyBudget, homeCurrency, spentToday, remainingToday }`
- `POST /groups/:groupId/split-expense` `{ amount, currency, category, note, participantUserIds }` -> splits evenly, converts each participant's share to their own home currency
