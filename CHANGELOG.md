# Changelog

All notable changes to Stax will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MVP (v0.1.0)** – Initial release.
  - Overview: total portfolio value, allocation by asset class, top 5 positions, pull-to-refresh.
  - Holdings: list with filters by asset class, sort by value, tap to detail.
  - Add Asset: listed (Stock, ETF, Crypto, Metal) with symbol, quantity, optional cost basis; non-listed (Fixed income, Real estate, Cash, Other) with value, currency, optional event schedules.
  - Holding Detail: summary, edit holding, events list, add/edit/delete event, delete holding.
  - Events and local notifications: maturity, coupon, amortization, valuation reminder, custom; configurable lead time (default 3 days).
  - RevenueCat: Free (1 portfolio, 15 holdings, 1 reminder schedule) vs Pro (unlimited); paywall on Analysis tab, 16th holding, second reminder schedule; restore purchases.
  - Pro Analysis: exposure breakdown (asset class, currency, country, sector), concentration metrics (top holding %, top 3 %, HHI), Stax Score with plain-language insights.
  - Settings: base currency, supported price feeds disclaimer, notification permission, restore purchases.
  - Analytics: typed events for onboarding, holding_added, paywall_viewed, analysis_viewed, event_created, notification_enabled.
  - Pricing: Alpha Vantage (stocks/ETFs), CoinGecko (crypto, metal); cache in SQLite.
  - Data: local-first SQLite (Portfolio, Holding, PricePoint, Event); Zod schemas; repositories.
