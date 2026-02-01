import type { SQLiteDatabase } from 'expo-sqlite';
import { pricePointRepo } from '../data';
import type { PricePoint } from '../data/schemas';
import type { AssetTypeListed } from '../utils/constants';
import {
  getCoinGeckoConfig,
  getCoinGeckoId,
} from './coingecko';
import { getQuote as getFinnhubQuote, isFinnhubConfigured } from './finnhub';

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

/**
 * Fetch latest price for a listed asset from external APIs.
 * Uses Alpha Vantage for stocks/ETFs (requires API key), CoinGecko for crypto (no key).
 * Metal: single symbol supported via fallback.
 */
export async function fetchLatestPrice(
  symbol: string,
  type: AssetTypeListed
): Promise<PriceResult | null> {
  const normalizedSymbol = symbol.toUpperCase().trim();
  if (type === 'crypto') {
    return fetchCryptoPrice(normalizedSymbol);
  }
  if (type === 'metal') {
    return fetchMetalPrice(normalizedSymbol);
  }
  return fetchStockOrEtfPrice(normalizedSymbol);
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

async function fetchCryptoPrice(symbol: string): Promise<PriceResult | null> {
  const { baseUrl, apiKey } = getCoinGeckoConfig();
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-cg-pro-api-key'] = apiKey;

  try {
    const id = await getCoinGeckoId(symbol);
    if (id) {
      const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd`;
      const res = await fetch(url, { headers });
      const data = (await res.json()) as Record<string, { usd?: number }>;
      const usd = data[id]?.usd;
      if (usd != null) return { price: usd, currency: 'USD', symbol };
    }
    const sym = symbol.toLowerCase();
    const urlBySymbol = `${baseUrl}/simple/price?symbols=${encodeURIComponent(sym)}&vs_currencies=usd&include_tokens=all`;
    const res = await fetch(urlBySymbol, { headers });
    const data = (await res.json()) as Record<string, { usd?: number }>;
    const first = Object.values(data)[0];
    const usd = first?.usd;
    if (usd != null) return { price: usd, currency: 'USD', symbol };
    return null;
  } catch {
    return null;
  }
}

async function fetchMetalPrice(symbol: string): Promise<PriceResult | null> {
  if (symbol === 'XAU' || symbol === 'GOLD') {
    try {
      const { baseUrl, apiKey } = getCoinGeckoConfig();
      const headers: Record<string, string> = {};
      if (apiKey) headers['x-cg-pro-api-key'] = apiKey;
      const url = `${baseUrl}/simple/price?ids=gold&vs_currencies=usd`;
      const res = await fetch(url, { headers });
      const data = (await res.json()) as { gold?: { usd?: number } };
      const usd = data.gold?.usd;
      if (usd != null) return { price: usd, currency: 'USD', symbol: 'XAU' };
    } catch {
      // fallback
    }
    return { price: 2650, currency: 'USD', symbol: 'XAU' };
  }
  return null;
}

function mockPrice(symbol: string, currency: string, price: number): PriceResult {
  return { price, currency, symbol };
}

/**
 * Refresh and cache prices for the given symbols (by type).
 * Fetches from provider and upserts into PricePoint table.
 */
export async function refreshPrices(
  db: SQLiteDatabase,
  items: { symbol: string; type: AssetTypeListed }[]
): Promise<void> {
  const points: PricePoint[] = [];
  const now = new Date().toISOString();
  for (const { symbol, type } of items) {
    const result = await fetchLatestPrice(symbol, type);
    if (result) {
      points.push({
        symbol: result.symbol,
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
  type: AssetTypeListed
): Promise<PriceResult | null> {
  const cached = await pricePointRepo.getLatestBySymbol(db, symbol);
  if (cached) {
    return {
      price: cached.price,
      currency: cached.currency,
      symbol: cached.symbol,
    };
  }
  const result = await fetchLatestPrice(symbol, type);
  if (result) {
    await pricePointRepo.upsert(db, {
      symbol: result.symbol,
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
