/**
 * Finnhub API: symbol search and quote (latest, previous close, daily change %).
 * Free tier: rate limits per minute; see https://finnhub.io/docs/api/rate-limit
 * Set EXPO_PUBLIC_FINNHUB_API_KEY for stock/ETF symbol search and quotes.
 * @see https://finnhub.io/docs/api/symbol-search
 * @see https://finnhub.io/docs/api/quote
 */

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

/** Single search result from symbol search. */
export interface FinnhubSearchResult {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

/** Raw quote response from Finnhub (c=current, pc=previous close, dp=day % change). */
export interface FinnhubQuoteResponse {
  c?: number;  // current price
  d?: number;  // change
  dp?: number; // percent change
  h?: number;  // high
  l?: number;  // low
  o?: number;  // open
  pc?: number; // previous close
  t?: number;  // timestamp
}

/** Normalized quote for app use. */
export interface StockQuote {
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: string;
}

function getApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_FINNHUB_API_KEY?.trim() || undefined;
}

/**
 * Search for stock/ETF symbols by query (e.g. "AAPL", "apple").
 * Returns matching symbols with description and type; empty array if no key or error.
 */
export async function searchSymbols(q: string): Promise<FinnhubSearchResult[]> {
  const apiKey = getApiKey();
  if (!apiKey || !q.trim()) return [];

  try {
    const url = `${FINNHUB_BASE}/search?q=${encodeURIComponent(q.trim())}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { count?: number; result?: FinnhubSearchResult[] };
    const result = data.result ?? [];
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Fetch real-time quote for a symbol: current price, previous close, daily change %.
 * Returns null if no key, symbol not found, or request fails.
 */
export async function getQuote(symbol: string): Promise<StockQuote | null> {
  const apiKey = getApiKey();
  if (!apiKey || !symbol.trim()) return null;

  const sym = symbol.trim().toUpperCase();
  try {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as FinnhubQuoteResponse;
    const c = data.c;
    const pc = data.pc;
    if (c == null || typeof c !== 'number') return null;
    const previousClose = pc != null && typeof pc === 'number' ? pc : c;
    const changePercent = data.dp != null && typeof data.dp === 'number' ? data.dp : 0;
    return {
      symbol: sym,
      price: c,
      previousClose,
      changePercent,
      currency: 'USD',
    };
  } catch {
    return null;
  }
}

/** Whether Finnhub is configured (for feature gating symbol search / quote). */
export function isFinnhubConfigured(): boolean {
  return !!getApiKey();
}

// ---------------------------------------------------------------------------
// In-memory cache for rate-limit-sensitive endpoints
// ---------------------------------------------------------------------------

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

const CANDLE_TTL = 4 * 60 * 60 * 1000;   // 4 hours
const EARNINGS_TTL = 24 * 60 * 60 * 1000; // 24 hours
const METRICS_TTL = 24 * 60 * 60 * 1000;  // 24 hours

// ---------------------------------------------------------------------------
// Stock Candles (historical OHLCV)
// ---------------------------------------------------------------------------

export interface FinnhubCandleResponse {
  c: number[];  // close
  h: number[];  // high
  l: number[];  // low
  o: number[];  // open
  t: number[];  // timestamps (UNIX seconds)
  v: number[];  // volume
  s: 'ok' | 'no_data';
}

/**
 * Fetch historical candle data for a symbol.
 * @param resolution - D (daily), W (weekly), M (monthly)
 * @param from - UNIX timestamp in seconds
 * @param to - UNIX timestamp in seconds
 */
export async function getStockCandle(
  symbol: string,
  resolution: 'D' | 'W' | 'M',
  from: number,
  to: number
): Promise<FinnhubCandleResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey || !symbol.trim()) return null;

  const sym = symbol.trim().toUpperCase();
  const cacheKey = `candle_${sym}_${resolution}_${from}_${to}`;
  const cached = getCached<FinnhubCandleResponse>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${FINNHUB_BASE}/stock/candle?symbol=${encodeURIComponent(sym)}&resolution=${resolution}&from=${from}&to=${to}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as FinnhubCandleResponse;
    if (data.s !== 'ok' || !data.c?.length) return null;
    setCache(cacheKey, data, CANDLE_TTL);
    return data;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Earnings (EPS actual vs estimate)
// ---------------------------------------------------------------------------

export interface FinnhubEarning {
  actual: number | null;
  estimate: number | null;
  period: string;            // "2024-03-31"
  quarter: number;           // 1-4
  surprisePercent: number | null;
  symbol: string;
  year: number;
}

/**
 * Fetch earnings data (EPS) for a symbol. Returns most recent first.
 */
export async function getEarnings(
  symbol: string,
  limit: number = 20
): Promise<FinnhubEarning[]> {
  const apiKey = getApiKey();
  if (!apiKey || !symbol.trim()) return [];

  const sym = symbol.trim().toUpperCase();
  const cacheKey = `earnings_${sym}_${limit}`;
  const cached = getCached<FinnhubEarning[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${FINNHUB_BASE}/stock/earnings?symbol=${encodeURIComponent(sym)}&limit=${limit}&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as FinnhubEarning[];
    const result = Array.isArray(data) ? data : [];
    setCache(cacheKey, result, EARNINGS_TTL);
    return result;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Basic Financials / Metrics
// ---------------------------------------------------------------------------

export interface FinnhubMetricData {
  [key: string]: number | null | undefined;
}

export interface FinnhubSeriesPoint {
  period: string;
  v: number;
}

export interface FinnhubMetricResponse {
  metric: FinnhubMetricData;
  series: {
    annual: Record<string, FinnhubSeriesPoint[]>;
    quarterly: Record<string, FinnhubSeriesPoint[]>;
  };
}

/**
 * Fetch basic financial metrics for a symbol (P/E, EPS, revenue, margins, etc.).
 */
export async function getBasicFinancials(
  symbol: string
): Promise<FinnhubMetricResponse | null> {
  const apiKey = getApiKey();
  if (!apiKey || !symbol.trim()) return null;

  const sym = symbol.trim().toUpperCase();
  const cacheKey = `metrics_${sym}`;
  const cached = getCached<FinnhubMetricResponse>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${FINNHUB_BASE}/stock/metric?symbol=${encodeURIComponent(sym)}&metric=all&token=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as FinnhubMetricResponse;
    if (!data.metric) return null;
    setCache(cacheKey, data, METRICS_TTL);
    return data;
  } catch {
    return null;
  }
}
