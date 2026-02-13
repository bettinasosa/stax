# Stax

**One place for your whole net worth.** Stax is a mobile portfolio tracker that unifies stocks, crypto, metals, real estate, and fixed income in a single view—so you can see allocation, performance, and diversification without juggling brokers and spreadsheets.

## Why Stax?

Net worth is scattered: brokerage accounts, DeFi wallets, property, gold, bonds. Stax was built to bring it all together: track holdings, get price updates, set reminders, and understand how your portfolio is actually allocated and performing. No more mental math across five apps.

## Features

- **Unified portfolio** — Stocks, ETFs, crypto, metals, real estate, and fixed income in one place with a single base currency (e.g. USD).
- **Live & cached prices** — Alpha Vantage for equities (optional); CoinGecko for crypto and gold; Supabase-backed price cache to reduce API usage.
- **Breakdown & fundamentals** — Portfolio value chart (Breakdown tab), candlestick charts per holding, earnings calendar, analyst sentiment, price targets, and portfolio vs benchmark comparison.
- **Analysis & insights** — Stax Score, allocation donut, concentration bars, TWRR/Sharpe, benchmark comparison, dividend analytics (Pro).
- **Alerts & events** — Reminders for dividends, options expiry, and custom events; timeline of past and upcoming events.
- **Import & export** — CSV import for holdings; CSV/PDF export; optional cloud backup (Supabase).
- **Hackathon-friendly** — Run in **guest mode** with no sign-up and no API keys. Add Supabase only if you want auth; add Alpha Vantage only if you want live stock prices.

## Quick start

```bash
npm install
cp .env.example .env   # optional: add API keys for live prices and RevenueCat
npm start
```

Then press `i` for iOS simulator or `a` for Android emulator.

## Environment variables

Copy `.env.example` to `.env` and fill in values as needed.

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Your [Supabase](https://supabase.com) project URL (required for sign-up/sign-in). |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon public key (required for sign-up/sign-in). |
| `EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY` | Live stock/ETF prices from [Alpha Vantage](https://www.alphavantage.co/support/#api-key) (free tier available). |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS` | RevenueCat public API key for iOS (from [RevenueCat](https://app.revenuecat.com)). |
| `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID` | RevenueCat public API key for Android. |

- **Accounts:** Without Supabase URL and anon key, the app runs in **guest mode** (no login screen; you go straight to the app). To let users create an account and sign in, add both Supabase vars (see below).
- **Pricing:** Without Alpha Vantage, listed assets use demo/mock values. Crypto and gold use CoinGecko (no key).
- **Paywall:** Without RevenueCat keys, the app runs in a free-only mode (no paywall).

Do not commit `.env`; it is listed in `.gitignore`.

### Connecting to Supabase (sign-up / sign-in)

To enable the login screen and let users create an account:

1. Go to [supabase.com](https://supabase.com) and sign in (or create an account).
2. Click **New project**, pick an org, name the project (e.g. “Stax”), set a database password, and create the project.
3. In the dashboard, open **Project Settings** (gear) → **API**.
4. Copy **Project URL** and **anon public** (under “Project API keys”).
5. In your project root, ensure you have a `.env` file (e.g. `cp .env.example .env`). Set:
   - `EXPO_PUBLIC_SUPABASE_URL=` your Project URL  
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=` your anon public key
6. Restart the Expo dev server (`npm start`) and reload the app.

After that, the app shows the login screen; users can **Sign up** (create account) or **Sign in**. Supabase Auth handles email/password and sessions; no extra backend code is required. In the Supabase dashboard you can see signed-up users under **Authentication** → **Users**.

## Database and accounts

- **Accounts** are handled by [Supabase Auth](https://supabase.com/docs/guides/auth). Add `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` to `.env` to enable sign-up and sign-in (see above). Without them, the app runs in guest mode.
- **Portfolio data** (holdings, events) is stored locally in **SQLite** (Expo SQLite) on the device:
  - The DB file is created automatically on first launch.
  - Migrations run inside the app via `initDb` when the app starts.
  - A default portfolio (“My Portfolio”, base currency USD) is created if none exist.
- **View your data:** Open **Settings** and check the **Your data** section for portfolio name, number of holdings, and number of events.

No extra setup or migrations are required; just run the app.

### Inspecting the database with external tools

The app uses a single SQLite file named **`stax.db`**. You can open it in [DB Browser for SQLite](https://sqlitebrowser.org/), the `sqlite3` CLI, or any SQLite client.

**Why you can’t “log in” to the DB:** The database file lives inside the app sandbox on the device or simulator. There is no network-accessible DB server—you open the file by copying it out or by running commands that read from the sandbox.

**iOS Simulator**

The file is on your Mac under the simulator’s data directory. Find it:

```bash
find ~/Library/Developer/CoreSimulator/Devices -name stax.db -print
```

Open it with the CLI:

```bash
sqlite3 $(find ~/Library/Developer/CoreSimulator/Devices -name stax.db | head -1)
```

Or copy the path from the `find` output and open `stax.db` in DB Browser for SQLite.

**Android Emulator**

The file is under the app’s private storage. Use **adb** (Android SDK). Replace `<package>` with your app’s package name (e.g. `host.exp.exponent` when using Expo Go).

List DB files:

```bash
adb shell run-as <package> ls /data/data/<package>/files/SQLite
```

Copy the database to your machine (e.g. to open in DB Browser):

```bash
adb shell run-as <package> cat /data/data/<package>/files/SQLite/stax.db > stax.db
```

Then open `stax.db` locally. You can also use **Device Explorer** in Android Studio: **View → Tool Windows → Device Explorer**, then navigate to `/data/data/<package>/files/SQLite/`.

**Physical devices**

On a real device you don’t have direct filesystem access. Use the in-app **Settings → Your data** view to see exported JSON, or rely on a debug build and platform-specific tools (e.g. Xcode → Devices → download container for iOS).

## Releasing to TestFlight

To build and submit the iOS app to TestFlight for beta testers, see **[docs/TESTFLIGHT.md](docs/TESTFLIGHT.md)**. You’ll need an Apple Developer account, Expo account, and the app configured in App Store Connect. Quick commands:

- `npm run build:ios` – production iOS build (EAS)
- `npm run submit:ios` – submit latest build to TestFlight

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo dev server |
| `npm run ios` | Run on iOS simulator |
| `npm run android` | Run on Android emulator |
| `npm run build:ios` | EAS production iOS build (for TestFlight/App Store) |
| `npm run submit:ios` | Submit latest iOS build to TestFlight |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |

## Project structure

- `src/app` – Navigation (tabs, stacks)
- `src/features/portfolio` – Overview, holdings list, portfolio utils
- `src/features/asset` – Add/edit asset, holding detail, events
- `src/features/analysis` – Pro analysis, paywall, entitlements
- `src/features/settings` – Settings screen
- `src/data` – SQLite schema, repositories, Zod schemas
- `src/services` – Pricing, RevenueCat, notifications, analytics
- `src/utils` – Money formatting, constants, UUID

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and testing.
