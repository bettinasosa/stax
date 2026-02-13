# Stax – Submission Story

_About the project: what inspired you, what you learned, how you built it, and the challenges you faced._

**Link to problem, target audience & monetization (1–2 pages):** [PROPOSAL.md](../PROPOSAL.md) (or `https://github.com/YOUR_ORG/stax/blob/main/PROPOSAL.md` if the repo is public).

---

## What inspired me

I started investing at a young age, and I've worked on several fintech startups—it's an area I'm really passionate about. I've always wanted a single place to track _all_ my investments—especially as someone who holds both traditional assets and crypto. Net worth was scattered across brokerages, DeFi wallets, and spreadsheets, and I kept seeing the same frustration on Reddit: “I have five brokerages and a spreadsheet and it’s a mess,” “Wish there was one app for stocks, crypto, and my property.” So I built Stax: one app for your whole net worth—stocks, ETFs, crypto, metals, real estate, fixed income, and cash—with a single total, live (or cached) prices, and proper diversification insight.

---

## What it does

Stax is a **mobile portfolio tracker** that puts your whole net worth in one place. You add holdings manually (or via CSV import and Ethereum wallet import for crypto)—stocks, ETFs, crypto, metals, real estate, fixed income, and cash—in any currency. The app converts everything to a base currency so you see **one total** and get **live or cached prices** where available. **Overview** shows your total value, how it’s changed, a 7-day chart, top holdings, and what’s coming up (dividends, maturities). **Holdings** is your full list with filters and sort; tap any holding for detail, cost basis, fundamentals, and to log dividends or events. **Breakdown** gives you fundamentals per holding and an **events timeline** so all your reminders and maturities are in one place. **Insights** is where diversification lives: the **Stax Score** (a single view of how your portfolio stacks up), **allocation** by sector and country, **concentration** risk, **benchmark comparison**, **time-weighted return**, **Sharpe ratio**, and dividend analytics. You can set **alerts** for maturities, dividends, and custom events so the app notifies you before key dates. All portfolio data stays **on your device** (local-first, private); optional Pro unlocks PDF export, net worth with liabilities, and deeper analysis.

---

## What I learned

I learned a lot about **portfolio theory and diversification** in practice: how to think about allocation by sector and country, concentration risk, and how to surface it in a simple “Stax Score.” I dove into metrics like **time-weighted return (TWRR)**, **Sharpe ratio** \(\displaystyle \frac{E[R_p - R_f]}{\sigma_p}\), and **benchmark comparison** so the app could answer “how am I really doing?” and “am I too exposed to one sector?” I also got deep on **indexes and market data**: what’s available for free, what’s rate-limited, and how to combine equities (Alpha Vantage, Finnhub), crypto (CoinGecko), and metals into one coherent pricing layer.

---

## How I built it

- **Stack:** Stax is a **React Native (Expo)** mobile app with **TypeScript**, **SQLite (Expo SQLite)** for all portfolio data on-device, and **Supabase** for auth and an optional server-side **price cache**.
- **Data & privacy:** Holdings, events, and reminders live **only on the device** (local-first). No server ever stores your positions—so the app is private by design. Manual entry is a feature: you control cost basis, dates, and currencies.
- **Pricing:** I use **Alpha Vantage** (and optionally **Finnhub**) for stocks/ETFs, **CoinGecko** for crypto and gold, and a **Supabase Edge Function** (`refresh-prices`) that runs on a schedule (e.g. every 6 hours) to fill a `price_cache` table. The app reads from the cache first to avoid per-user rate limits, then falls back to direct API calls when needed. A local SQLite `price_point` table keeps last-known prices for offline use.
- **Features:** Users add assets by type (stock, ETF, crypto, metal, real estate, fixed income, cash), in any currency; the app converts everything to a base currency for one total. There’s a **Breakdown** tab (fundamentals, events timeline), an **Insights** tab (Stax Score, allocation donut, concentration, TWRR, Sharpe, benchmark comparison, dividend analytics), and **alerts** for maturities, dividends, and custom events via **expo-notifications**. **RevenueCat** powers the Pro paywall (deeper analysis, PDF export, net worth with liabilities).
- **Import:** Besides manual entry, there’s **CSV import** for bulk holdings and **Ethereum wallet import** (Ethplorer) for crypto. Open Banking (e.g. Plaid, Tink) would be a next step but requires a dedicated backend and compliance work—I documented the options in `docs/DATA_IMPORT_OPTIONS.md`.

---

## Challenges I faced

- **Real-time data is hard.** Free tiers are tight (e.g. Alpha Vantage 25 req/day), and every provider has different rate limits, symbols, and conventions. I had to design a **caching layer** (Supabase `price_cache` + Edge Function + pg_cron) so the app could scale without blowing API quotas. Staleness rules differ by asset type (e.g. 15 min for stocks when the market is open, 30 min for crypto 24/7), so the logic had to be explicit and maintainable.
- **Open Banking has a million hurdles.** Letting users “connect my broker” would be ideal, but it means dealing with region-specific providers (Plaid, Tink, Yodlee), consent flows (PSD2, GDPR), and a backend to store and refresh tokens and normalize data. I chose to ship **manual + CSV + crypto wallet import** first and documented Open Banking as a clear roadmap item so the app could launch without that complexity.
- **Unifying many asset types and currencies.** Supporting stocks, ETFs, crypto, metals, real estate, fixed income, and cash in one schema and one UI meant careful **Zod** schemas, a single “holding” model with a type discriminator, and consistent **base-currency conversion** and formatting (e.g. with a shared money utility) so the Overview and Insights tabs always show a coherent picture.
- **Keeping it runnable without keys.** So judges and users can try it without signing up, Stax runs in **guest mode** (no Supabase = no login), uses **demo/mock** prices when Alpha Vantage isn’t configured, and only shows the paywall when RevenueCat keys are present. That required feature flags and fallbacks at every integration point.

---

## Accomplishments that I'm proud of

- **One app for every asset type** — Stocks, ETFs, crypto, metals, real estate, fixed income, and cash in a single portfolio with one base-currency total. No more juggling five apps or spreadsheets.
- **Privacy by design** — All portfolio data lives on the device (SQLite). We never store your positions on a server; manual entry is a feature, not a limitation.
- **Real pricing without breaking the bank** — A server-side price cache (Supabase Edge Function + pg_cron) so we can scale to many users without blowing free-tier API limits, plus offline fallback so the app works without a connection.
- **Diversification you can actually use** — Stax Score, allocation by sector and country, concentration risk, time-weighted return, Sharpe ratio, and benchmark comparison so you can see “how am I really doing?” and “am I too exposed?”
- **Alerts that matter** — Reminders for maturities, dividends, and custom events (expo-notifications), so you’re notified before key dates instead of after.
- **Ship and try without friction** — Guest mode (no sign-up), demo prices when no API keys are set, and TestFlight-ready builds so judges and users can run Stax immediately.

---

## What we learned

We learned how hard **real-time market data** is at scale: every provider has different rate limits and conventions, and free tiers are tight. We learned that **Open Banking** (connecting brokers and banks) is a huge undertaking—region-specific providers, consent flows, and backend token handling—so we shipped manual + CSV + crypto wallet import first and documented the rest as a clear roadmap. We also learned how much **portfolio theory** matters in practice: allocation, concentration, and metrics like TWRR and Sharpe aren’t just academic—they’re what users ask for when they want “one place to see everything.”

---

## What's next for Stax

- **Open Banking / broker linking** — Let users connect bank and brokerage accounts (e.g. via Plaid, Tink) so positions can sync instead of manual entry. We’ve scoped the options; next step is backend + compliance.
- **More chains for crypto** — Extend the wallet-import pattern to Solana, Base, Arbitrum, and others so DeFi users can pull in holdings from multiple networks.
- **“Since purchase” performance** — Use acquired dates and cost basis to show performance per holding from the day you bought, not just portfolio value over time.
- **Cloud backup & sync** — Optional encrypted backup of portfolio data to Supabase so users can restore on a new device or share read-only with an advisor.
- **Richer fundamentals & market pulse** — Deeper analyst ratings, price targets, and insider activity so Pro users get even more context on their holdings.

---

## Summary

Stax is a **privacy-first, local-first** portfolio tracker that unifies traditional and crypto investments in one place. I was inspired by my own need and by Reddit’s repeated asks for “one app for everything”; I learned a lot about diversification metrics and real-world market data; I built it with Expo, SQLite, Supabase (auth + price cache), and multiple price providers behind a cache; and the main challenges were real-time data and rate limits, Open Banking complexity, and unifying many asset types and currencies without losing simplicity.
