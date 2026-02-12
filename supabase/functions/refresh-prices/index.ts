/**
 * Supabase Edge Function: refresh-prices
 *
 * Fetches latest prices for all tracked symbols and upserts them into
 * the `price_cache` table. Designed to run on a schedule (pg_cron) or
 * be invoked on-demand by Pro users.
 *
 * Environment variables (set in Supabase dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL           – auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY – auto-injected
 *   FINNHUB_API_KEY        – for stocks/ETFs
 *   ALPHA_VANTAGE_API_KEY  – for metals (XAU, XAG, etc.)
 *   COINGECKO_API_KEY      – optional, for crypto (demo or pro key)
 *   COINGECKO_PRO          – set to "true" if using a Pro CoinGecko key
 *
 * Deploy:
 *   supabase functions deploy refresh-prices --no-verify-jwt
 *
 * Schedule (via SQL after deploying):
 *   SELECT cron.schedule(
 *     'refresh-prices-daily',
 *     '0 */6 * * *',  -- every 6 hours
 *     $$SELECT net.http_post(
 *       url := '<SUPABASE_URL>/functions/v1/refresh-prices',
 *       headers := jsonb_build_object(
 *         'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
 *         'Content-Type', 'application/json'
 *       ),
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ---------------------------------------------------------------------------
// Supabase client (service role – can bypass RLS)
// ---------------------------------------------------------------------------

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, serviceRoleKey);

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY') ?? '';
const AV_KEY = Deno.env.get('ALPHA_VANTAGE_API_KEY') ?? '';
const CG_KEY = Deno.env.get('COINGECKO_API_KEY') ?? '';
const CG_PRO = Deno.env.get('COINGECKO_PRO') === 'true';

const CG_BASE = CG_PRO
  ? 'https://pro-api.coingecko.com/api/v3'
  : 'https://api.coingecko.com/api/v3';
const CG_HEADER = CG_PRO ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedSymbol {
  symbol: string;
  asset_type: string;
  metadata: Record<string, string> | null;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  currency: string;
  previous_close?: number;
  change_percent?: number;
  asset_type: string;
  source: string;
}

// ---------------------------------------------------------------------------
// Price fetchers (server-side versions — no client dependencies)
// ---------------------------------------------------------------------------

/** Fetch stock/ETF price from Finnhub. */
async function fetchStockPrice(symbol: string): Promise<PriceUpdate | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.c || data.c === 0) return null;
    return {
      symbol,
      price: data.c,
      currency: 'USD',
      previous_close: data.pc ?? undefined,
      change_percent: data.dp ?? undefined,
      asset_type: 'stock',
      source: 'finnhub',
    };
  } catch {
    return null;
  }
}

/** Fetch crypto price from CoinGecko. */
async function fetchCryptoPrice(
  symbol: string,
  metadata: Record<string, string> | null,
): Promise<PriceUpdate | null> {
  const headers: Record<string, string> = {};
  if (CG_KEY) headers[CG_HEADER] = CG_KEY;

  // Try by provider ID first
  const providerId = metadata?.provider_id ?? metadata?.providerId;
  if (providerId) {
    const result = await fetchCoinGeckoById(providerId, symbol, headers);
    if (result) return result;
  }

  // Try common ID mappings
  const commonIds: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    DOGE: 'dogecoin',
    ADA: 'cardano',
    DOT: 'polkadot',
    AVAX: 'avalanche-2',
    MATIC: 'matic-network',
    LINK: 'chainlink',
    UNI: 'uniswap',
    XRP: 'ripple',
    LTC: 'litecoin',
    ATOM: 'cosmos',
  };

  const id = commonIds[symbol.toUpperCase()];
  if (id) {
    const result = await fetchCoinGeckoById(id, symbol, headers);
    if (result) return result;
  }

  return null;
}

async function fetchCoinGeckoById(
  id: string,
  symbol: string,
  headers: Record<string, string>,
): Promise<PriceUpdate | null> {
  try {
    const url = `${CG_BASE}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const coin = data[id];
    if (!coin?.usd) return null;
    return {
      symbol,
      price: coin.usd,
      currency: 'USD',
      change_percent: coin.usd_24h_change ?? undefined,
      asset_type: 'crypto',
      source: 'coingecko',
    };
  } catch {
    return null;
  }
}

/** Fetch metal spot price from Alpha Vantage. */
async function fetchMetalPrice(symbol: string): Promise<PriceUpdate | null> {
  if (!AV_KEY) return null;

  const metalMap: Record<string, string> = {
    XAU: 'XAU', GOLD: 'XAU',
    XAG: 'XAG', SILVER: 'XAG',
    XPT: 'XPT', PLATINUM: 'XPT',
    XPD: 'XPD', PALLADIUM: 'XPD',
  };

  const isoCode = metalMap[symbol.toUpperCase()];
  if (!isoCode) return null;

  try {
    const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${isoCode}&to_currency=USD&apikey=${AV_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    const rate = data['Realtime Currency Exchange Rate'];
    const priceStr = rate?.['5. Exchange Rate'] ?? rate?.['8. Bid Price'];
    if (!priceStr) return null;
    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) return null;
    return {
      symbol,
      price,
      currency: 'USD',
      asset_type: 'metal',
      source: 'alphavantage',
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  try {
    // Optional: accept a subset of symbols in the request body
    let requestedSymbols: string[] | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (Array.isArray(body.symbols)) {
          requestedSymbols = body.symbols;
        }
      } catch {
        // Empty body is fine — refresh all tracked symbols
      }
    }

    // 1. Get tracked symbols from DB
    let query = supabase.from('tracked_symbols').select('symbol, asset_type, metadata');
    if (requestedSymbols) {
      query = query.in('symbol', requestedSymbols);
    }

    const { data: trackedSymbols, error: fetchError } = await query;
    if (fetchError) {
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!trackedSymbols || trackedSymbols.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No symbols to refresh', updated: 0 }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 2. Fetch prices in parallel (with concurrency limit)
    const BATCH_SIZE = 5;
    const updates: PriceUpdate[] = [];
    const errors: string[] = [];

    for (let i = 0; i < trackedSymbols.length; i += BATCH_SIZE) {
      const batch = trackedSymbols.slice(i, i + BATCH_SIZE) as TrackedSymbol[];
      const results = await Promise.allSettled(
        batch.map(async (tracked) => {
          const { symbol, asset_type, metadata } = tracked;
          let result: PriceUpdate | null = null;

          switch (asset_type) {
            case 'crypto':
              result = await fetchCryptoPrice(symbol, metadata);
              break;
            case 'metal':
              result = await fetchMetalPrice(symbol);
              break;
            case 'stock':
            case 'etf':
            case 'commodity':
            default:
              result = await fetchStockPrice(symbol);
              break;
          }

          if (result) {
            updates.push(result);
          } else {
            errors.push(`${symbol}: no price available`);
          }
        }),
      );

      // Brief delay between batches to avoid rate limits
      if (i + BATCH_SIZE < trackedSymbols.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    // 3. Upsert all prices into price_cache
    if (updates.length > 0) {
      const rows = updates.map((u) => ({
        symbol: u.symbol,
        price: u.price,
        currency: u.currency,
        previous_close: u.previous_close ?? null,
        change_percent: u.change_percent ?? null,
        asset_type: u.asset_type,
        source: u.source,
        updated_at: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from('price_cache')
        .upsert(rows, { onConflict: 'symbol' });

      if (upsertError) {
        errors.push(`Upsert error: ${upsertError.message}`);
      }
    }

    // 4. Also save to price_history for daily snapshots
    const today = new Date().toISOString().slice(0, 10);
    if (updates.length > 0) {
      const historyRows = updates.map((u) => ({
        symbol: u.symbol,
        date: today,
        price: u.price,
        currency: u.currency,
        source: u.source,
      }));

      // Ignore conflicts (already have today's snapshot)
      await supabase
        .from('price_history')
        .upsert(historyRows, { onConflict: 'symbol,date', ignoreDuplicates: true });
    }

    return new Response(
      JSON.stringify({
        message: `Refreshed ${updates.length}/${trackedSymbols.length} prices`,
        updated: updates.length,
        total: trackedSymbols.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
