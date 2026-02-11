/**
 * FX rates service: fetches live exchange rates from Frankfurter (ECB data).
 * Free, no API key required. ~33 major currencies.
 * In-memory cache with 4-hour TTL, falls back to stale cache on error.
 */

const FX_BASE_URL = 'https://api.frankfurter.app/latest?base=USD';
const FX_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface FxCache {
  rates: Record<string, number>;
  fetchedAt: number;
}

let fxCache: FxCache | null = null;

interface FrankfurterResponse {
  rates?: Record<string, number>;
}

/**
 * Fetch FX rates relative to USD from Frankfurter (ECB data, no API key).
 * Returns a rates map { USD: 1, EUR: 0.92, GBP: 0.79, ... }.
 * Returns null on error when no cached data is available.
 */
export async function fetchFxRates(): Promise<Record<string, number> | null> {
  const now = Date.now();
  if (fxCache && now - fxCache.fetchedAt < FX_CACHE_TTL_MS) {
    return fxCache.rates;
  }
  try {
    const res = await fetch(FX_BASE_URL);
    if (!res.ok) return fxCache?.rates ?? null;
    const data = (await res.json()) as FrankfurterResponse;
    if (!data.rates) return fxCache?.rates ?? null;
    // Frankfurter omits the base currency from the response
    const rates: Record<string, number> = { USD: 1, ...data.rates };
    fxCache = { rates, fetchedAt: now };
    return rates;
  } catch {
    return fxCache?.rates ?? null;
  }
}
