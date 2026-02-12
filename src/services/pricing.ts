import type { SQLiteDatabase } from 'expo-sqlite';
import { pricePointRepo } from '../data';
import type { PricePoint } from '../data/schemas';
import type { AssetTypeListed } from '../utils/constants';
import { normalizeSymbol } from '../utils/constants';
import { getCoinGeckoConfig, getCoinGeckoId } from './coingecko';
import { getCoinMarketCapPrice, isCoinMarketCapConfigured } from './coinmarketcap';
import { getQuote as getFinnhubQuote, isFinnhubConfigured } from './finnhub';
import { getCachedPrice, getCachedPrices } from './supabasePriceCache';

const PRICE_SOURCE = 'stax_mvp';
const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

/** Result of fetching a single price. Optional quote fields for stocks (previous close, daily change %). */
export interface PriceResult {
  price: number;
  currency: string;
  symbol: string;
  previousClose?: number;
  changePercent?: number;
}

export interface PriceMetadata {
  providerId?: string;
  contractAddress?: string;
  network?: string;
}

/**
 * Fetch latest price for a listed asset.
 * Priority: Supabase server cache → direct API calls.
 *
 * When Supabase is configured, the server-side Edge Function keeps prices fresh
 * on a schedule. Clients read from the cache first, only hitting external APIs
 * as a fallback (e.g. new symbol not yet tracked, or Supabase not set up).
 */
export async function fetchLatestPrice(
  symbol: string,
  type: AssetTypeListed,
  metadata?: PriceMetadata
): Promise<PriceResult | null> {
  const normalizedSymbol = normalizeSymbol(symbol);

  // 1. Try Supabase server cache first (fast, no rate-limit concern)
  const cached = await getCachedPrice(normalizedSymbol);
  if (cached) {
    console.log(`[Pricing] ${normalizedSymbol}: from Supabase cache (${cached.source}, age=${timeSince(cached.updatedAt)})`);
    return {
      price: cached.price,
      currency: cached.currency,
      symbol: normalizedSymbol,
      previousClose: cached.previousClose ?? undefined,
      changePercent: cached.changePercent ?? undefined,
    };
  }

  // 2. Fallback to direct API calls
  if (type === 'crypto') {
    return fetchCryptoPrice(normalizedSymbol, metadata);
  }
  if (type === 'metal') {
    return fetchMetalPrice(normalizedSymbol);
  }
  if (type === 'commodity') {
    return fetchStockOrEtfPrice(normalizedSymbol);
  }
  return fetchStockOrEtfPrice(normalizedSymbol);
}

/** Human-readable time since a given ISO timestamp. */
function timeSince(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

async function fetchStockOrEtfPrice(symbol: string): Promise<PriceResult | null> {
  if (isFinnhubConfigured()) {
    const quote = await getFinnhubQuote(symbol);
    if (quote) {
      return {
        price: quote.price,
        currency: quote.currency,
        symbol: quote.symbol,
        previousClose: quote.previousClose,
        changePercent: quote.changePercent,
      };
    }
  }
  const apiKey = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return mockPrice(symbol, 'USD', 100);
  }
  try {
    const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as { 'Global Quote'?: { '05. price'?: string } };
    const quote = data['Global Quote'];
    const priceStr = quote?.['05. price'];
    if (priceStr == null) return null;
    const price = parseFloat(priceStr);
    if (Number.isNaN(price)) return null;
    return { price, currency: 'USD', symbol };
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(
  symbol: string,
  metadata?: PriceMetadata
): Promise<PriceResult | null> {
  const { baseUrl, apiKey, headerName } = getCoinGeckoConfig();
  const headers: Record<string, string> = {};
  if (apiKey) headers[headerName] = apiKey;

  try {
    const providerId = metadata?.providerId?.trim();
    if (providerId) {
      const direct = await fetchCoinGeckoPriceById(providerId, symbol, baseUrl, headers);
      if (direct) return direct;
    }
    const contractAddress = metadata?.contractAddress?.trim();
    if (contractAddress) {
      const token = await fetchCoinGeckoTokenPrice(
        contractAddress,
        metadata?.network,
        symbol,
        baseUrl,
        headers
      );
      if (token) return token;
    }
    const id = await getCoinGeckoId(symbol);
    if (id) {
      const byId = await fetchCoinGeckoPriceById(id, symbol, baseUrl, headers);
      if (byId) return byId;
    }
    const sym = symbol.toLowerCase();
    const urlBySymbol = `${baseUrl}/simple/price?symbols=${encodeURIComponent(sym)}&vs_currencies=usd&include_24hr_change=true&include_tokens=all`;
    const res = await fetch(urlBySymbol, { headers });
    const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number | null }>;
    const candidate = data[sym] ?? data[symbol] ?? data[symbol.toUpperCase()] ?? Object.values(data)[0];
    const usd = candidate?.usd;
    if (usd != null) {
      const changePercent = candidate?.usd_24h_change != null ? candidate.usd_24h_change : undefined;
      return { price: usd, currency: 'USD', symbol, ...(changePercent != null && { changePercent }) };
    }
    if (isCoinMarketCapConfigured()) {
      const cmc = await getCoinMarketCapPrice(symbol);
      if (cmc) {
        return {
          price: cmc.price,
          currency: 'USD',
          symbol,
          ...(cmc.changePercent != null && { changePercent: cmc.changePercent }),
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchCoinGeckoPriceById(
  id: string,
  symbol: string,
  baseUrl: string,
  headers: Record<string, string>
): Promise<PriceResult | null> {
  const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number | null }>;
  const coin = data[id];
  const usd = coin?.usd;
  if (usd == null) return null;
  const changePercent = coin?.usd_24h_change != null ? coin.usd_24h_change : undefined;
  return { price: usd, currency: 'USD', symbol, ...(changePercent != null && { changePercent }) };
}

async function fetchCoinGeckoTokenPrice(
  contractAddress: string,
  network: string | undefined,
  symbol: string,
  baseUrl: string,
  headers: Record<string, string>
): Promise<PriceResult | null> {
  const normalized = contractAddress.trim().toLowerCase();
  if (!normalized) return null;
  const chain = network?.trim().toLowerCase() || 'ethereum';
  const url = `${baseUrl}/simple/token_price/${encodeURIComponent(chain)}?contract_addresses=${encodeURIComponent(
    normalized
  )}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number | null }>;
  const token = data[normalized];
  const usd = token?.usd;
  if (usd == null) return null;
  const changePercent = token?.usd_24h_change != null ? token.usd_24h_change : undefined;
  return { price: usd, currency: 'USD', symbol, ...(changePercent != null && { changePercent }) };
}

/**
 * Canonical metal symbol mapping (user-friendly names → ISO codes).
 * Alpha Vantage supports XAU, XAG, XPT, XPD as forex "from" currencies.
 */
const METAL_SYMBOL_MAP: Record<string, string> = {
  XAU: 'XAU',
  GOLD: 'XAU',
  XAG: 'XAG',
  SILVER: 'XAG',
  XPT: 'XPT',
  PLATINUM: 'XPT',
  XPD: 'XPD',
  PALLADIUM: 'XPD',
};

/** CoinGecko fallback IDs for metal-backed tokens. */
const METAL_COINGECKO_IDS: Record<string, string> = {
  XAU: 'pax-gold',
  XAG: 'silver-token',
};

/**
 * Fetch metal spot price per troy ounce.
 * Primary: Alpha Vantage CURRENCY_EXCHANGE_RATE (supports XAU/XAG/XPT/XPD natively).
 * Fallback: CoinGecko metal-backed token (gold/silver only — pax-gold tracks physical spot closely).
 *
 * IMPORTANT: We intentionally do NOT fall back to metal-tracking ETFs (GLD, SLV, etc.)
 * because ETF share prices ≠ metal spot prices per ounce. Using them would corrupt
 * the cached price and cause values to "jostle" between correct and wrong prices.
 * When all providers fail, we return null so the DB-cached last known price is preserved.
 */
async function fetchMetalPrice(symbol: string): Promise<PriceResult | null> {
  const isoCode = METAL_SYMBOL_MAP[symbol];
  if (!isoCode) return null;

  // 1. Alpha Vantage forex (primary — supports metal ISO codes natively, returns spot per oz)
  const avResult = await fetchMetalPriceViaAlphaVantage(isoCode, symbol);
  if (avResult) {
    console.log(`[Pricing] Metal ${symbol}: Alpha Vantage → $${avResult.price.toFixed(2)}`);
    return avResult;
  }
  console.warn(`[Pricing] Metal ${symbol}: Alpha Vantage failed, trying CoinGecko…`);

  // 2. CoinGecko metal-backed token (gold only — pax-gold tracks physical spot closely)
  const coinGeckoId = METAL_COINGECKO_IDS[isoCode];
  if (coinGeckoId) {
    try {
      const { baseUrl, apiKey, headerName } = getCoinGeckoConfig();
      const headers: Record<string, string> = {};
      if (apiKey) headers[headerName] = apiKey;
      const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(coinGeckoId)}&vs_currencies=usd&include_24hr_change=true`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number | null }>;
        const coin = data[coinGeckoId];
        if (coin?.usd != null) {
          const changePercent = coin.usd_24h_change != null ? coin.usd_24h_change : undefined;
          return { price: coin.usd, currency: 'USD', symbol, ...(changePercent != null && { changePercent }) };
        }
      }
    } catch {
      // fall through
    }
  }

  // Return null — the DB cache in usePortfolio will keep showing the last known good price
  return null;
}

/**
 * Fetch metal spot price via Alpha Vantage CURRENCY_EXCHANGE_RATE.
 * Supports XAU, XAG, XPT, XPD as "from_currency" with USD as "to_currency".
 */
async function fetchMetalPriceViaAlphaVantage(
  isoCode: string,
  originalSymbol: string,
): Promise<PriceResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `${ALPHA_VANTAGE_BASE}?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(isoCode)}&to_currency=USD&apikey=${apiKey}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      'Realtime Currency Exchange Rate'?: {
        '5. Exchange Rate'?: string;
        '8. Bid Price'?: string;
        '9. Ask Price'?: string;
      };
    };
    const rate = data['Realtime Currency Exchange Rate'];
    const priceStr = rate?.['5. Exchange Rate'] ?? rate?.['8. Bid Price'];
    if (priceStr == null) return null;
    const price = parseFloat(priceStr);
    if (Number.isNaN(price) || price <= 0) return null;
    return { price, currency: 'USD', symbol: originalSymbol };
  } catch {
    return null;
  }
}

function mockPrice(symbol: string, currency: string, price: number): PriceResult {
  return { price, currency, symbol };
}

/**
 * Refresh and cache prices for the given symbols (by type).
 *
 * Attempts to batch-read from Supabase cache first (single round-trip for all
 * symbols). Only fetches from external APIs for symbols not found in the cache.
 * All results are upserted into the local SQLite PricePoint table.
 */
export async function refreshPrices(
  db: SQLiteDatabase,
  items: { symbol: string; type: AssetTypeListed; metadata?: PriceMetadata }[]
): Promise<void> {
  const points: PricePoint[] = [];
  const now = new Date().toISOString();

  // 1. Batch-read from Supabase cache
  const allSymbols = items.map((i) => normalizeSymbol(i.symbol));
  const supabasePrices = await getCachedPrices(allSymbols);

  // 2. For each item: use Supabase cache if available, else fetch from API
  for (const { symbol, type, metadata } of items) {
    const normalizedSymbol = normalizeSymbol(symbol);

    // Check Supabase cache first
    const cached = supabasePrices.get(normalizedSymbol);
    if (cached) {
      points.push({
        symbol: normalizedSymbol,
        timestamp: now,
        price: cached.price,
        currency: cached.currency,
        source: `supabase_${cached.source}`,
        ...(cached.previousClose != null && { previousClose: cached.previousClose }),
        ...(cached.changePercent != null && { changePercent: cached.changePercent }),
      });
      continue;
    }

    // Fallback to direct API call
    const result = await fetchLatestPrice(normalizedSymbol, type, metadata);
    if (
      result &&
      typeof result.price === 'number' &&
      Number.isFinite(result.price) &&
      result.price > 0
    ) {
      points.push({
        symbol: normalizeSymbol(result.symbol),
        timestamp: now,
        price: result.price,
        currency: result.currency,
        source: PRICE_SOURCE,
        ...(result.previousClose != null && { previousClose: result.previousClose }),
        ...(result.changePercent != null && { changePercent: result.changePercent }),
      });
    }
  }

  if (points.length > 0) {
    await pricePointRepo.upsertMany(db, points);
  }
}

/**
 * Get latest price for a symbol from DB, or fetch and cache if missing.
 */
export async function getLatestPrice(
  db: SQLiteDatabase,
  symbol: string,
  type: AssetTypeListed,
  metadata?: PriceMetadata
): Promise<PriceResult | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
  const cached = await pricePointRepo.getLatestBySymbol(db, normalizedSymbol);
  if (cached) {
    return {
      price: cached.price,
      currency: cached.currency,
      symbol: cached.symbol,
    };
  }
  const result = await fetchLatestPrice(normalizedSymbol, type, metadata);
  if (
    result &&
    typeof result.price === 'number' &&
    Number.isFinite(result.price) &&
    result.price > 0
  ) {
    await pricePointRepo.upsert(db, {
      symbol: normalizeSymbol(result.symbol),
      timestamp: new Date().toISOString(),
      price: result.price,
      currency: result.currency,
      source: PRICE_SOURCE,
      ...(result.previousClose != null && { previousClose: result.previousClose }),
      ...(result.changePercent != null && { changePercent: result.changePercent }),
    });
  }
  return result;
}
