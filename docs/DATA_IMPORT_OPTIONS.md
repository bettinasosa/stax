# Data import options

Ways to make it easier for users to bring their data into Stax (beyond manual entry and the existing crypto wallet import).

## Current state

- **Manual entry:** Users add holdings one-by-one (stocks, ETFs, crypto, metals, real estate, cash, fixed income, other).
- **Crypto wallet import:** For crypto, users can enter an Ethereum address; the app fetches token balances via Ethplorer and lets them bulk-import. This pattern (connect → fetch → map → import) is reusable.

Data lives in local SQLite; auth is via Supabase. There is no backend today that stores linked accounts or syncs from third parties.

---

## Option 1: Open Banking / account aggregation

**Idea:** Let users connect bank accounts, brokers, or investment platforms via an Open Banking or aggregation provider. Balances and (optionally) transactions flow into Stax and map to holdings (e.g. cash, stocks).

**Typical providers:**

- **Plaid** (US-focused, also UK/CA) – bank linking, investments, identity.
- **Tink** (EU/UK) – PSD2/Open Banking, many banks and some brokers.
- **TrueLayer** (UK/EU) – Open Banking, payments.
- **Yodlee** (global) – bank/broker aggregation.

**What you get:** Account list, balances, and often transactions. Some providers expose investment positions (e.g. Plaid Investments); others only checking/savings.

**Considerations:**

- **Backend required:** You need a server (or Supabase Edge Functions + secrets) to:
  - Store and refresh provider access tokens.
  - Call provider APIs and optionally normalize to your schema.
  - Expose a small API or sync job the app can call.
- **Compliance & consent:** Open Banking has strict consent and data-handling rules (PSD2, GDPR, etc.). Providers usually help with flows; you still need a clear privacy policy and user consent.
- **Region:** Coverage is region-specific (US vs UK vs EU). Pick a provider that matches your target market.
- **Data mapping:** Map provider “accounts” and “balances” to Stax concepts: e.g. one bank account → one “cash” holding; investment account → multiple “stock”/“ETF” holdings if the API gives positions.

**Fit for Stax:** High value for “connect my bank/broker and see everything in one place,” but it’s a larger project (backend, compliance, provider contract). Best as a dedicated roadmap item.

---

## Option 2: CSV / OFX (file import)

**Idea:** Users export a CSV or OFX file from their bank or broker; they upload or paste it in the app. The app parses the file and creates (or updates) holdings and optionally events.

**Pros:**

- No third-party API for *linking*; only parsing logic.
- Works with any institution that offers export.
- Can support both “positions” (current holdings) and “transactions” (for events or cost basis).
- Reuses existing schema: each row → holding or event.

**Cons:**

- One-off import (or repeated manual export/import); not live sync.
- Parsing is institution-specific unless you define a strict template.

**Practical approach:**

1. **Define a “Stax CSV” template** (e.g. `type,name,symbol,quantity,cost_basis,currency`) and document it in Settings or Help. Users or external tools can convert their export to this format.
2. **Add a “Import from file” flow** in Settings or Add Asset: pick file (or paste) → parse with Zod → validate → show preview → insert into SQLite (respecting FREE_HOLDINGS_LIMIT and Pro).
3. **Optionally** add parsers for one or two popular formats (e.g. a specific broker’s CSV or OFX) as a convenience.

**Fit for Stax:** High impact for effort. No backend, no new provider; fits the current local-first architecture. Good first step before Open Banking.

---

## Option 3: More wallet / chain imports

**Idea:** Reuse the existing “wallet import” pattern for more chains (e.g. Solana, Base, Arbitrum). Same UX: user enters address → app fetches balances (via a public API or indexer) → user selects tokens → bulk import.

**Pros:** Same UX as Ethereum; code structure (fetch → map → holding creation) already exists. Expands coverage for crypto users.

**Cons:** Need a reliable API per chain; some chains have less standard “token list” APIs.

**Fit for Stax:** Natural extension of the current crypto import; can be done incrementally per chain.

---

## Option 4: Broker / investment-platform APIs

**Idea:** Integrate with brokers that offer APIs (e.g. Schwab, Interactive Brokers, Alpaca). User signs in via OAuth; app fetches positions and optionally transactions.

**Pros:** Direct, often real-time positions; good for active traders.

**Cons:** Per-broker integration; OAuth and token storage need a backend. Rate limits and API changes.

**Fit for Stax:** Useful once you have a backend and want to target specific broker users. Can complement Open Banking (aggregator vs. direct).

---

## Recommended order

1. **Short term:** **CSV (and optionally OFX) import** – template + “Import from file” in-app. No backend, immediate value.
2. **Next:** **More wallet imports** (e.g. Solana) – reuse existing pattern.
3. **Medium term:** **Open Banking** – once you’re ready for a small backend and compliance, add one provider (e.g. Plaid for US or Tink for EU) and map accounts → holdings.
4. **Later:** Broker-specific APIs if you have backend capacity and demand.

---

## Implementation notes (when you add import)

- **Validation:** Use Zod schemas (e.g. extend or reuse `createListedHoldingSchema` / `createNonListedHoldingSchema`) for parsed rows; reject invalid rows and show which lines failed.
- **Idempotency / updates:** Decide whether import always creates new holdings or can update existing (e.g. by symbol + portfolio). Wallet import today only adds new symbols; same idea can apply to CSV.
- **Limits:** Enforce `FREE_HOLDINGS_LIMIT` and Pro in the import path (as in wallet import).
- **Analytics:** Reuse or add events like `trackImportStarted` / `trackImportCompleted` / `trackImportFailed` for CSV and future Open Banking.
- **Settings / docs:** List supported import methods in Settings (with `SUPPORTED_PRICE_FEEDS`) and link to a short “How to import” (template + steps).

This doc can be updated as you implement (e.g. add “CSV import – done” and “Open Banking – in progress”) and referenced from CONTRIBUTING or the main README.
