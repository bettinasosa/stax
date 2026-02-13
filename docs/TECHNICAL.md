# Stax Technical Documentation

This document describes the tech stack, application architecture, and RevenueCat implementation for the Stax portfolio tracker.

---

## 1. Tech Stack

### Runtime & framework

| Layer          | Technology                                                                     |
| -------------- | ------------------------------------------------------------------------------ |
| **Runtime**    | React Native with Expo (SDK 54+)                                               |
| **Language**   | TypeScript                                                                     |
| **React**      | 19.x                                                                           |
| **Navigation** | React Navigation 7 — `@react-navigation/native`, `native-stack`, `bottom-tabs` |

### Data & storage

| Layer                       | Technology                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **Local DB**                | SQLite via `expo-sqlite` — single file `stax.db`, migrations run in-app on startup                                               |
| **Validation**              | Zod — all DTOs, input schemas, and response shapes; TypeScript types inferred from schemas                                       |
| **Auth & optional backend** | Supabase — Auth for sign-up/sign-in; optional cloud backup and price cache (see [Supabase Price Cache](SUPABASE_PRICE_CACHE.md)) |

### Services & integrations

| Purpose                       | Technology                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Payments / subscriptions**  | RevenueCat via `react-native-purchases` (see [RevenueCat implementation](#3-revenuecat-implementation) below) |
| **Pricing — equities**        | Alpha Vantage (optional); Finnhub / Yahoo Finance fallbacks; Supabase price cache to reduce API usage         |
| **Pricing — crypto & metals** | CoinGecko (no API key required for basic tier)                                                                |
| **FX rates**                  | Derived from pricing APIs and configurable base currency                                                      |
| **Notifications**             | `expo-notifications` — reminders for dividends, maturities, custom events                                     |
| **Export**                    | `expo-print` + `expo-sharing` for PDF; CSV export; optional cloud backup                                      |

### UI & assets

| Layer       | Technology                                                                         |
| ----------- | ---------------------------------------------------------------------------------- |
| **Charts**  | `react-native-chart-kit` + `react-native-svg`                                      |
| **Fonts**   | `@expo-google-fonts/inter`, `@expo-google-fonts/fraunces` (loaded via `expo-font`) |
| **Styling** | StyleSheet + shared `theme` (`src/utils/theme.ts`) — no Tailwind (React Native)    |

### Development & quality

| Tool                                | Purpose                                      |
| ----------------------------------- | -------------------------------------------- |
| **ESLint**                          | Linting (Expo config + TypeScript)           |
| **Prettier**                        | Formatting                                   |
| **Vitest**                          | Unit tests (hooks, utils, repositories)      |
| **EAS (Expo Application Services)** | iOS/Android builds and TestFlight submission |

---

## 2. Architecture

### High-level flow

```
App.tsx
  ├── configureRevenueCat()        — once at startup
  ├── AuthProvider                  — Supabase auth or guest
  ├── SQLiteProvider (stax.db)      — initDb + migrations
  └── RootNavigator
        ├── [No Supabase] → Guest: Onboarding → Main app
        ├── [Supabase]    → Login/SignUp → Onboarding → Main app
        └── Main app      → EntitlementsProvider → Tab navigator (Overview, Holdings, Charts, Insights)
```

- **Guest mode:** If `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are not set, the app skips login and runs with a single local user; all portfolio data stays on device.
- **Authenticated mode:** Supabase Auth handles sessions; cloud backup (and optional price cache) use the same project when configured.

### Folder structure

| Path                     | Responsibility                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app`                | Root navigator, tab/stack setup, navigation params (e.g. Paywall `trigger`), header buttons                                                       |
| `src/contexts`           | `AuthContext` (auth + onboarding), `EntitlementsContext` (Pro status, purchase, restore)                                                          |
| `src/features/portfolio` | Overview screen, holdings list, portfolio selector, portfolio stats                                                                               |
| `src/features/asset`     | Add/edit asset, holding detail, events, wallet import, listed asset form                                                                          |
| `src/features/analysis`  | Insights tab: Stax Score, allocation, concentration, performance, paywall, entitlements hook                                                      |
| `src/features/charts`    | Breakdown (charts), candlesticks, benchmarks, comparison, fundamentals                                                                            |
| `src/features/liability` | Net worth: add/edit liabilities (Pro)                                                                                                             |
| `src/features/settings`  | Settings, CSV import, cloud backup (Pro when Supabase configured), restore purchases                                                              |
| `src/features/alerts`    | Alerts list, upcoming reminders                                                                                                                   |
| `src/data`               | SQLite schema and migrations (`db.ts`), repositories (portfolio, holding, event, price_point, liability, lot, transaction, snapshot), Zod schemas |
| `src/services`           | Pricing (Alpha Vantage, CoinGecko, cache), RevenueCat, notifications, analytics, PDF, CSV import/export, cloud backup, FX                         |
| `src/components`         | Reusable UI (buttons, inputs, date picker, etc.)                                                                                                  |
| `src/utils`              | Theme, money formatting, constants, UUID                                                                                                          |

### Data layer

- **Single SQLite DB:** `stax.db` created and migrated on first run via `initDb()` (see `src/data/db.ts`). Tables include `portfolio`, `holding`, `price_point`, `event`, `lot`, `portfolio_value_snapshot`, `liability`, and supporting indexes.
- **Repositories:** Each entity has a repository (e.g. `holdingRepository`, `eventRepository`) that encapsulates SQL and uses Zod-validated types where applicable.
- **No ORM:** Raw SQL with `expo-sqlite`; migrations are ordered SQL strings in `db.ts`.

### Pricing pipeline

- **Equities:** Optional Alpha Vantage; app can use Finnhub/Yahoo or Supabase price cache (see [SUPABASE_PRICE_CACHE.md](SUPABASE_PRICE_CACHE.md)).
- **Crypto / metals:** CoinGecko.
- **Cache:** Supabase `price_cache` table + Edge Function `refresh-prices` (scheduled) for server-side caching; local `price_point` table for on-device cache and offline.
- **Demo mode:** If Alpha Vantage (and optionally other keys) are missing, app uses mock/demo prices so it remains runnable without keys.

### Feature flags and “no keys” behavior

- **Supabase:** Missing URL/anon key → guest mode (no login screen).
- **Alpha Vantage:** Missing key → demo/mock prices for equities.
- **RevenueCat:** Missing iOS/Android API keys → paywall not shown; app runs in free-only mode (see below).

---

## 3. RevenueCat Implementation

### Overview

Stax uses [RevenueCat](https://www.revenuecat.com/) and the `react-native-purchases` SDK to sell **Stax Pro** as a subscription. Entitlement name in the RevenueCat dashboard is **`Stax Pro`**. Without RevenueCat API keys, the app does not show the paywall and treats the user as free-only.

### Configuration

- **When:** `configureRevenueCat()` is called once at app startup in `App.tsx` (before any UI).
- **Keys:**
  - iOS: `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
  - Android: `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`  
    Keys are read at build time (Expo env). If neither key is set, the RevenueCat SDK is not configured and all entitlement checks resolve to “not Pro.”
- **Idempotency:** A module-level flag ensures `Purchases.configure()` is only called once.

### Service layer (`src/services/revenuecat.ts`)

| Function                              | Purpose                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `configureRevenueCat()`               | One-time SDK init with platform-specific API key.                                                                                                      |
| `isRevenueCatConfigured()`            | Returns whether at least one API key is set (used to show/hide paywall and “pricing unavailable” messaging).                                           |
| `getCustomerInfo()`                   | Fetches current `CustomerInfo` (entitlements). Returns `null` if no keys or on error.                                                                  |
| `isProFromCustomerInfo(customerInfo)` | Returns whether the `Stax Pro` entitlement is active.                                                                                                  |
| `getOfferings()`                      | Fetches current offerings and packages (for paywall pricing).                                                                                          |
| `purchasePackage(pkg)`                | Runs the purchase flow; re-fetches `CustomerInfo` after success so entitlements are up to date; returns `null` on user cancel, throws on other errors. |
| `restorePurchases()`                  | Restores previous purchases and returns updated `CustomerInfo` (or `null`).                                                                            |

Entitlement identifier is the constant **`Stax Pro`** (must match the product/entitlement in RevenueCat dashboard).

### Entitlement state and context

- **`EntitlementsContext`** (`src/contexts/EntitlementsContext.tsx`) is the single source of truth for Pro status.
- **Provider placement:** Wraps the main app (inside `RootNavigator`), so all tabs and screens (Overview, Holdings, Charts, Insights, Settings, Paywall) share the same `isPro` and purchase/restore callbacks.
- **Behavior:**
  - On mount: fetches `CustomerInfo` and sets `isPro` from `isProFromCustomerInfo(info)`.
  - On app foreground: subscribes to `AppState` and calls `refresh()` when app becomes `active` so that restores or purchases made elsewhere (e.g. another device) are reflected.
  - `refresh()`: re-fetches `CustomerInfo` and updates `isPro`.
  - `purchase(pkg)` / `restorePurchases()`: after a successful purchase or restore, updates `isPro` from the returned `CustomerInfo`.
- **Hook:** `useEntitlements()` in `src/features/analysis/useEntitlements.ts` simply exposes `useEntitlementsContext()` so feature code does not depend on context directly.

### Paywall screen (`src/features/analysis/PaywallScreen.tsx`)

- **When shown:**
  - From Analysis (Insights) tab when the user taps a Pro-gated section.
  - From other flows when a free-tier limit is hit (e.g. 16th holding, second reminder schedule, net worth with liabilities, benchmark comparison, etc.).
  - Navigated to as a stack screen; can receive a `trigger` param for benefit-first messaging (e.g. “Add more than 25 holdings”).
- **Behavior:**
  - If `isPro` is already true, the component renders nothing (screen can be dismissed).
  - On open: calls `refresh()` so entitlement is up to date (e.g. after restore on another device).
  - Fetches offerings via `getOfferings()` and displays `current.availablePackages` (annual pre-selected when available).
  - Displays package options with labels (Annual, Monthly, etc.), trial badge when `introPrice` is present, and price strings from the store.
  - Subscribe button: calls `purchase(selectedPkg)`; on success, fires `onSuccess` (e.g. navigates back) and tracks trial/purchase in analytics.
  - Restore: calls `restorePurchases()`; on success, fires `onSuccess`.
  - “Maybe later” calls `onDismiss` when provided.
- **When RevenueCat is not configured:** Paywall can still be shown (e.g. from limits), but copy indicates “Subscription pricing unavailable in this build” and offerings are empty.

### Where Pro is enforced

- **Holdings:** Free tier limited to **25 holdings** (see `FREE_HOLDINGS_LIMIT` in `src/utils/constants.ts`; higher in `__DEV__`). Adding beyond that or using wallet import beyond the limit shows the paywall (e.g. from `AddAssetScreen`, `ListedAssetForm`, `WalletImportForm`).
- **Reminder schedules:** Free tier limited to **1** reminder schedule (`FREE_REMINDER_SCHEDULES_LIMIT`); adding a second schedule triggers the paywall (e.g. in `AddEventScreen`).
- **Insights / Analysis:** Deep analysis (e.g. Stax Score, allocation donut, concentration, TWRR, Sharpe, benchmarks, dividend analytics) is gated; tapping when not Pro shows the paywall (e.g. `AnalysisScreen`).
- **Charts:** Benchmark comparison and “Compare Portfolios” are Pro; paywall shown when not Pro (e.g. `ChartsScreen`, `PortfolioComparisonScreen`).
- **Net worth / liabilities:** Adding or viewing liabilities is Pro (e.g. `OverviewScreen`, `AddLiabilityScreen`).
- **Cloud backup:** Shown in Settings only when both Supabase and Pro are enabled (`SettingsScreen`, `CloudBackupSection`).
- **Import:** CSV import limits number of holdings by free-tier limit when not Pro (`ImportCSVScreen`).

All of the above use `useEntitlements().isPro` (or the context’s `isPro`) to decide whether to allow the action or navigate to the paywall with an optional `trigger` string.

### Free vs Pro (summary)

| Capability                            | Free   | Pro                            |
| ------------------------------------- | ------ | ------------------------------ |
| Holdings                              | 25 max | Unlimited                      |
| Reminder schedules                    | 1      | Unlimited                      |
| Stax Score, allocation, concentration | No     | Yes                            |
| TWRR, Sharpe, benchmarks              | No     | Yes                            |
| Dividend analytics                    | No     | Yes                            |
| Compare portfolios / benchmarks       | No     | Yes                            |
| Liabilities / net worth               | No     | Yes                            |
| PDF report                            | No     | Yes                            |
| Cloud backup                          | No     | Yes (when Supabase configured) |

### Testing and builds

- **Expo Go / dev:** In-app purchases are not fully reliable; use a development build or TestFlight for real purchase/restore flows.
- **No keys:** With RevenueCat keys unset, the app runs in free-only mode and does not show subscription pricing; useful for demos and judging without a RevenueCat account.

---

## 4. Related documentation

- **[README.md](../README.md)** — Setup, environment variables, project structure, Supabase auth, TestFlight.
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** — Stack overview, folder structure, conventions, testing, commits.
- **[docs/SUPABASE_PRICE_CACHE.md](SUPABASE_PRICE_CACHE.md)** — Price cache schema, Edge Function, and setup.
- **[docs/TESTFLIGHT.md](TESTFLIGHT.md)** — EAS build and TestFlight submission.
- **[docs/DATA_IMPORT_OPTIONS.md](DATA_IMPORT_OPTIONS.md)** — Data import options and architecture notes.
