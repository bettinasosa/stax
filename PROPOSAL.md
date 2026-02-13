# Stax – Problem, Target Audience & Monetization

A 1–2 page overview for judges and partners. For the full submission story (inspiration, build, challenges), see [docs/SUBMISSION_STORY.md](docs/SUBMISSION_STORY.md).

---

## The problem

**Net worth is scattered.** Anyone who invests across more than one platform—brokerages, DeFi wallets, property, gold, bonds—has no single place to see their whole picture. People end up with five broker apps, a spreadsheet, and mental math to answer “what am I actually worth?” and “how am I really diversified?”

- **No unified view:** Stocks in one app, crypto in another, real estate and fixed income elsewhere. There is no standard “one app for everything” that includes both traditional and crypto assets.
- **Diversification is invisible:** Even when you have the data, it’s hard to see allocation by sector or country, concentration risk, or how your portfolio compares to a benchmark. Retail tools either don’t show this or lock it behind institutional products.
- **Non-listed assets are forgotten:** Fixed income, maturities, and amortization don’t show up in most portfolio apps. Users want reminders before key dates (e.g. bond maturity), not just live prices for listed tickers.
- **Privacy vs. convenience:** Aggregators that connect to your accounts require sharing credentials or OAuth with third parties. Many users want to track everything without linking every broker and bank.

Reddit and investing communities repeatedly ask for the same thing: “one app for stocks, crypto, and my property,” “I have five brokerages and a spreadsheet and it’s a mess.” Stax addresses that gap.

---

## Target audience

- **Multi-asset investors** — People who hold stocks/ETFs and crypto (and optionally metals, real estate, fixed income). They want one total and one place to see allocation and performance.
- **Privacy-conscious users** — Those who prefer not to link every account. Stax is local-first: you add holdings manually (or via CSV / wallet import). Data stays on the device; we never store positions on a server.
- **Diversification-minded savers** — Bogleheads, index investors, and anyone who cares about sector/country exposure, concentration risk, and “am I too heavy in one thing?” They want a Stax Score, allocation view, and benchmark comparison without paying for institutional tools.
- **People with non-listed assets** — Holders of bonds, loans, or other fixed income who need reminders for maturities and amortization, not just ticker prices.
- **Geographic scope** — Initially English-speaking markets (US, UK, etc.). Multi-currency support and base-currency conversion make it usable for international holdings; Open Banking (e.g. Plaid, Tink) would be a later, region-specific expansion.

---

## Monetization strategy

**Freemium mobile app** with a clear free tier and a **Pro** subscription (in-app purchase via **RevenueCat**).

### Free tier

- **One portfolio**, up to **15 holdings**, **one reminder schedule**.
- Full **Overview** (total value, chart, top holdings, upcoming events).
- **Holdings** list, filters, and holding detail (cost basis, fundamentals, events).
- **Breakdown** (fundamentals per holding, events timeline).
- **Insights:** Stax Score and a taste of allocation/concentration; deeper analysis and benchmarks are gated.
- **Alerts** for maturities, dividends, and custom events (within the one reminder schedule).
- **CSV import** and **Ethereum wallet import** for crypto.
- **Guest mode** so users can try the app without signing up.

Free users hit the paywall when they add a 16th holding, create a second reminder schedule, or tap into **Market Pulse**, **Deep Analysis**, or **Dividend analytics** in Insights.

### Pro (Stax Pro)

- **Unlimited** portfolios, holdings, and reminder schedules.
- **PDF export** of portfolio/overview.
- **Net worth view** including liabilities (assets minus debts in one place).
- **Market Pulse** — Analyst ratings, price targets, insider activity.
- **Deep Analysis** — Full allocation (sector/country), concentration metrics, benchmark comparison (e.g. S&P 500), time-weighted return, Sharpe ratio, dividend analytics.
- **On-demand price refresh** (where supported) for nearer-to-real-time prices.
- **Cloud backup** (optional Supabase-backed restore for Pro users).
- **Compare portfolios** (when user has 2+ portfolios).

Pro is positioned as “full insights and no limits”: power users and anyone who cares about diversification and reporting pay for Pro; casual trackers can stay free.

### Future monetization options

- **B2B / white-label:** License the aggregation and analytics engine to advisors or small wealth managers.
- **Premium data or add-ons:** Optional data packs (e.g. more benchmarks, extra fundamentals) as one-time or subscription add-ons.
- **Open Banking tier:** If we add broker/bank linking, a “Sync” or “Plus” tier for automated position sync could sit alongside or above Pro.

---
