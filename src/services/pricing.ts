import type { SQLiteDatabase } from 'expo-sqlite';
import { pricePointRepo } from '../data';
import type { PricePoint } from '../data/schemas';
import type { AssetTypeListed } from '../utils/constants';
import { normalizeSymbol } from '../utils/constants';
import { getCoinGeckoConfig, getCoinGeckoId } from './coingecko';
import { getCoinMarketCapPrice, isCoinMarketCapConfigured } from './coinmarketcap';
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

export interface PriceMetadata {
  providerId?: string;
  contractAddress?: string;
  network?: string;
}

/**
 * Fetch latest price for a listed asset from external APIs.
 * Uses Alpha Vantage for stocks/ETFs/commodities (requires API key), CoinGecko for crypto (no key; optional CMC fallback).
 * Metal: single symbol supported via fallback.
 */
export async function fetchLatestPrice(
  symbol: string,
  type: AssetTypeListed,
  metadata?: PriceMetadata
): Promise<PriceResult | null> {
  const normalizedSymbol = normalizeSymbol(symbol);
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
  const { baseUrl, apiKey } = getCoinGeckoConfig();
  const headers: Record<string, string> = {};
  if (apiKey) headers['x-cg-pro-api-key'] = apiKey;

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
  items: { symbol: string; type: AssetTypeListed; metadata?: PriceMetadata }[]
): Promise<void> {
  const points: PricePoint[] = [];
  const now = new Date().toISOString();
  for (const { symbol, type, metadata } of items) {
    const normalizedSymbol = normalizeSymbol(symbol);
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
