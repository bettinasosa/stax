/**
 * Yahoo Finance v8 Chart API: free OHLCV candle data for stocks, ETFs, crypto.
 * No API key required. Used as the primary candle data source for benchmark charts.
 *
 * Endpoint: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
 * Supports: range (1d,5d,1mo,3mo,6mo,1y,2y,5y,10y,ytd,max) + interval (1d,1wk,1mo)
 *
 * @see https://finance.yahoo.com
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw response shape from Yahoo Finance v8 chart endpoint. */
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        symbol?: string;
        regularMarketPrice?: number;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { code?: string; description?: string };
  };
}

/** Normalized candle response matching Finnhub's shape for easy swap. */
export interface YahooCandleResponse {
  c: number[]; // close
  h: number[]; // high
  l: number[]; // low
  o: number[]; // open
  t: number[]; // timestamps (UNIX seconds)
  v: number[]; // volume
  s: 'ok' | 'no_data';
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** Map our app time windows to Yahoo Finance range params. */
const RANGE_MAP: Record<string, string> = {
  '7D': '5d',
  '1M': '1mo',
  '3M': '3mo',
  'ALL': '1y',
};

// In-memory cache (same pattern as finnhub.ts)
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

const CANDLE_TTL = 4 * 60 * 60 * 1000; // 4 hours

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch historical OHLCV candle data from Yahoo Finance.
 * Returns data in the same shape as Finnhub candles for drop-in compatibility.
 *
 * @param symbol - Ticker symbol (e.g. SPY, AAPL, BTC-USD)
 * @param timeWindow - One of '7D', '1M', '3M', 'ALL' (maps to Yahoo range param)
 * @returns Candle response or null on failure
 */
export async function getYahooCandle(
  symbol: string,
  timeWindow: string,
): Promise<YahooCandleResponse | null> {
  const sym = symbol.trim().toUpperCase();
  if (!sym) return null;

  const range = RANGE_MAP[timeWindow] || '1mo';
  const cacheKey = `yahoo_candle_${sym}_${range}`;
  const cached = getCached<YahooCandleResponse>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${YAHOO_BASE}/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        // Yahoo Finance may check user-agent on some endpoints
        'User-Agent': 'Mozilla/5.0 (compatible; StaxApp/1.0)',
      },
    });

    if (!res.ok) {
      console.warn(`[Yahoo] Candle ${sym}: HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as YahooChartResponse;

    if (data.chart?.error) {
      console.warn(`[Yahoo] Candle ${sym}: API error`, data.chart.error.description);
      return null;
    }

    const result = data.chart?.result?.[0];
    if (!result?.timestamp || !result.indicators?.quote?.[0]) {
      console.warn(`[Yahoo] Candle ${sym}: no data in response`);
      return null;
    }

    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];

    // Filter out null values (Yahoo returns null for some days, e.g. holidays)
    const opens: number[] = [];
    const highs: number[] = [];
    const lows: number[] = [];
    const closes: number[] = [];
    const volumes: number[] = [];
    const validTimestamps: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const o = quote.open?.[i];
      const h = quote.high?.[i];
      const l = quote.low?.[i];
      const c = quote.close?.[i];
      const v = quote.volume?.[i];

      if (o != null && h != null && l != null && c != null) {
        opens.push(o);
        highs.push(h);
        lows.push(l);
        closes.push(c);
        volumes.push(v ?? 0);
        validTimestamps.push(timestamps[i]);
      }
    }

    if (closes.length === 0) {
      console.warn(`[Yahoo] Candle ${sym}: all data points were null`);
      return { c: [], h: [], l: [], o: [], t: [], v: [], s: 'no_data' };
    }

    const candle: YahooCandleResponse = {
      c: closes,
      h: highs,
      l: lows,
      o: opens,
      t: validTimestamps,
      v: volumes,
      s: 'ok',
    };

    setCache(cacheKey, candle, CANDLE_TTL);
    console.log(`[Yahoo] Candle ${sym}: ${closes.length} data points for range=${range}`);
    return candle;
  } catch (err) {
    console.warn(`[Yahoo] Candle ${sym}: fetch error`, err);
    return null;
  }
}

/**
 * Fetch candle data using UNIX timestamps (Finnhub-compatible signature).
 * Converts from/to timestamps to the nearest Yahoo range parameter.
 */
export async function getYahooCandleByTimestamp(
  symbol: string,
  _resolution: 'D' | 'W' | 'M',
  from: number,
  to: number,
): Promise<YahooCandleResponse | null> {
  const days = Math.round((to - from) / 86400);
  let timeWindow: string;
  if (days <= 7) timeWindow = '7D';
  else if (days <= 30) timeWindow = '1M';
  else if (days <= 90) timeWindow = '3M';
  else timeWindow = 'ALL';

  return getYahooCandle(symbol, timeWindow);
}
