# Supabase Price Cache Setup

Server-side price cache that eliminates per-user API rate limits and enables scaling.

## Architecture

```
┌─────────────┐     reads      ┌──────────────┐
│  Mobile App  │ ←────────────→ │  price_cache  │  (Supabase Postgres)
│  (client)    │                │  table        │
└──────┬───────┘                └──────┬────────┘
       │                               │
       │ fallback                      │ upserts
       │ (direct API)                  │
       ▼                               ▼
┌─────────────┐              ┌──────────────────┐
│  Finnhub    │              │  Edge Function:   │
│  CoinGecko  │              │  refresh-prices   │  ← pg_cron schedule
│  Alpha V.   │              │  (service role)   │
└─────────────┘              └──────────────────┘
```

**Free users**: Read from Supabase cache (updated every 6 hours by the Edge Function).
**Pro users**: Can trigger on-demand refreshes via the Edge Function for near-real-time prices.
**Offline**: Local SQLite cache (`price_point` table) always shows last known good price.

## Setup Steps

### 1. Create a Supabase Project

If you haven't already:
1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **anon public** key
3. Add them to `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
```

### 2. Run the Migration

In the Supabase dashboard → **SQL Editor**, paste and run:

```
supabase/migrations/20260211_price_cache.sql
```

Or via CLI:

```bash
supabase db push
```

This creates:
- `price_cache` — latest price per symbol (primary read table for clients)
- `tracked_symbols` — which symbols the server should refresh
- `price_history` — daily snapshots for charting
- `upsert_price()` — helper function for the Edge Function

### 3. Deploy the Edge Function

```bash
# Install Supabase CLI if needed
npm i -g supabase

# Login and link your project
supabase login
supabase link --project-ref <your-project-ref>

# Deploy the function (no JWT verification — it checks service role internally)
supabase functions deploy refresh-prices --no-verify-jwt
```

### 4. Set Edge Function Secrets

In the Supabase dashboard → **Edge Functions** → **refresh-prices** → **Secrets**, or via CLI:

```bash
supabase secrets set FINNHUB_API_KEY=your_finnhub_key
supabase secrets set ALPHA_VANTAGE_API_KEY=your_av_key
supabase secrets set COINGECKO_API_KEY=your_cg_key
# Only if you have a CoinGecko Pro key:
# supabase secrets set COINGECKO_PRO=true
```

### 5. Schedule Automatic Refreshes

In the SQL Editor, enable pg_cron and schedule the Edge Function:

```sql
-- Enable the extension (one-time)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule every 6 hours (free tier budget-friendly)
SELECT cron.schedule(
  'refresh-prices-6h',
  '0 */6 * * *',
  $$SELECT net.http_post(
    url := 'https://your-project.supabase.co/functions/v1/refresh-prices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

> Replace `YOUR_SERVICE_ROLE_KEY` with your Supabase service role key
> (Dashboard → Project Settings → API → **service_role** key).

### 6. Seed Tracked Symbols

Add the symbols you want the server to refresh:

```sql
INSERT INTO tracked_symbols (symbol, asset_type) VALUES
  ('AAPL', 'stock'),
  ('MSFT', 'stock'),
  ('SPY', 'etf'),
  ('BTC', 'crypto'),
  ('ETH', 'crypto'),
  ('XAU', 'metal'),
  ('XAG', 'metal')
ON CONFLICT (symbol) DO NOTHING;
```

Or let the app auto-sync: the client calls `syncTrackedSymbols()` when holdings change.

### 7. Test It

```bash
# Manual trigger
curl -X POST https://your-project.supabase.co/functions/v1/refresh-prices \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"

# Check results
# In SQL Editor:
SELECT * FROM price_cache ORDER BY updated_at DESC;
```

## How It Works in the App

The integration is automatic. In `pricing.ts`:

1. **`fetchLatestPrice()`** checks Supabase `price_cache` first
2. If the cached price is fresh (within staleness thresholds), it's used immediately
3. If stale or missing, falls back to direct API calls (Finnhub, CoinGecko, Alpha Vantage)
4. All prices are saved to local SQLite for offline access

**`refreshPrices()`** (bulk refresh) does a single batch query to Supabase for all symbols,
then only calls external APIs for any symbols not in the cache.

## Staleness Thresholds

| Asset Type | Market Open | Market Closed |
|-----------|-------------|---------------|
| Stock/ETF | 15 min      | 6 hours       |
| Crypto    | 30 min      | 30 min (24/7) |
| Metal     | 60 min      | 60 min        |

## Cost Estimates

With the server-side cache, your API usage is **per-server, not per-user**:

| Provider       | Free Tier            | Estimated Cost at Scale |
|---------------|----------------------|------------------------|
| Finnhub       | 60 req/min           | $0/mo (free tier works for server) |
| Alpha Vantage | 25 req/day (free)    | $50/mo (Premium, 75 req/min) |
| CoinGecko     | 30 req/min (Demo)    | $129/mo (Analyst, 500 req/min) |
| Supabase      | Free tier (500MB DB) | $25/mo (Pro, 8GB DB) |

**Total for launch**: ~$0/mo (all free tiers) → ~$200/mo at scale (thousands of users).

## Pro User On-Demand Refresh

Pro users can trigger real-time refreshes:

```typescript
import { triggerPriceRefresh } from '../services/supabasePriceCache';

// Refresh specific symbols
const result = await triggerPriceRefresh(['AAPL', 'BTC']);
console.log(`Updated ${result?.updated} prices`);

// Refresh all tracked symbols
const result = await triggerPriceRefresh();
```
