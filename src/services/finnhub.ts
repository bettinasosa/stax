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
