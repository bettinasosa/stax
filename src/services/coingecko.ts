/**
 * CoinGecko API: coin list (symbol → id) and request config.
 * Used by pricing.ts for crypto and metal prices.
 *
 * Key tiers:
 *   - No key: free endpoint, no header, strict rate limits.
 *   - Demo key: free endpoint + `x-cg-demo-api-key` header, relaxed limits.
 *   - Pro key: pro endpoint + `x-cg-pro-api-key` header (set EXPO_PUBLIC_COINGECKO_PRO=1).
 *
 * @see https://docs.coingecko.com/reference/coins-list
 * @see https://docs.coingecko.com/reference/simple-price
 */

const FREE_BASE = 'https://api.coingecko.com/api/v3';
const PRO_BASE = 'https://pro-api.coingecko.com/api/v3';

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
}

let symbolToIdCache: Map<string, string> | null = null;
let listFetchPromise: Promise<Map<string, string>> | null = null;

/**
 * Returns base URL, optional API key, and the correct header name.
 * Demo keys use the free base URL with `x-cg-demo-api-key`.
 * Pro keys (opt-in via EXPO_PUBLIC_COINGECKO_PRO=1) use the pro URL with `x-cg-pro-api-key`.
 */
export function getCoinGeckoConfig(): {
  baseUrl: string;
  apiKey: string | undefined;
  headerName: string;
} {
  const apiKey = process.env.EXPO_PUBLIC_COINGECKO_API_KEY?.trim();
  const isPro = !!process.env.EXPO_PUBLIC_COINGECKO_PRO?.trim();

  if (apiKey && isPro) {
    return { baseUrl: PRO_BASE, apiKey, headerName: 'x-cg-pro-api-key' };
  }
  // Demo key (or no key): use the free endpoint
  return {
    baseUrl: FREE_BASE,
    apiKey: apiKey || undefined,
    headerName: 'x-cg-demo-api-key',
  };
}

/**
 * Fetches CoinGecko coins list and builds symbol (lowercase) → id map.
 * First coin per symbol wins (handles duplicates like USDC on multiple chains).
 * Cached in memory for the session.
 */
export async function getSymbolToIdMap(): Promise<Map<string, string>> {
  if (symbolToIdCache != null) return symbolToIdCache;
  if (listFetchPromise != null) return listFetchPromise;

  listFetchPromise = (async () => {
    const { baseUrl, apiKey, headerName } = getCoinGeckoConfig();
    const url = `${baseUrl}/coins/list`;
    const headers: Record<string, string> = {};
    if (apiKey) headers[headerName] = apiKey;

    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`CoinGecko list: ${res.status}`);
    const list = (await res.json()) as CoinListItem[];
    const map = new Map<string, string>();
    for (const coin of list) {
      const sym = coin.symbol?.toLowerCase();
      if (sym && !map.has(sym)) map.set(sym, coin.id);
    }
    symbolToIdCache = map;
    return map;
  })();

  return listFetchPromise;
}

/**
 * Resolves a ticker symbol to CoinGecko coin id, or null if not found.
 */
export async function getCoinGeckoId(symbol: string): Promise<string | null> {
  const sym = symbol.trim().toLowerCase();
  if (!sym) return null;
  const map = await getSymbolToIdMap();
  return map.get(sym) ?? null;
}

/** [timestamp_ms, price_usd] from market_chart/range. */
export interface HistoricalPricePoint {
  timestampMs: number;
  priceUsd: number;
}

/**
 * Fetches historical prices for a token by contract address in a time range.
 * Uses /coins/{platform}/contract/{contract_address}/market_chart/range.
 * Returns array of [timestamp_ms, price_usd]; empty if not found or error.
 */
export async function fetchHistoricalPricesByContract(
  platform: string,
  contractAddress: string,
  fromTimestamp: number,
  toTimestamp: number
): Promise<HistoricalPricePoint[]> {
  const { baseUrl, apiKey, headerName } = getCoinGeckoConfig();
  const platformId = (platform || 'ethereum').trim().toLowerCase();
  const contract = contractAddress.trim().toLowerCase();
  const url = `${baseUrl}/coins/${platformId}/contract/${contract}/market_chart/range?vs_currency=usd&from=${fromTimestamp}&to=${toTimestamp}`;
  const headers: Record<string, string> = {};
  if (apiKey) headers[headerName] = apiKey;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    prices?: [number, number][];
  };
  const raw = data.prices ?? [];
  return raw.map(([ts, price]) => ({ timestampMs: ts, priceUsd: price }));
}

/**
 * Find nearest price at or before timestamp from a sorted list of points.
 */
export function nearestPriceAtOrBefore(
  points: HistoricalPricePoint[],
  timestampMs: number
): number | null {
  if (points.length === 0) return null;
  let best: HistoricalPricePoint | null = null;
  for (const p of points) {
    if (p.timestampMs > timestampMs) break;
    best = p;
  }
  return best?.priceUsd ?? null;
}
