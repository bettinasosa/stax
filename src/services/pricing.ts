import type { SQLiteDatabase } from 'expo-sqlite';
import { pricePointRepo } from '../data';
import type { PricePoint } from '../data/schemas';
import type { AssetTypeListed } from '../utils/constants';
import { normalizeSymbol } from '../utils/constants';
import { getCoinGeckoConfig, getCoinGeckoId } from './coingecko';
import { getCoinMarketCapPrice, isCoinMarketCapConfigured } from './coinmarketcap';
import { getQuote as getFinnhubQuote, isFinnhubConfigured } from './finnhub';
import { getCachedPrice, getCachedPrices, writeCachedPrices } from './supabasePriceCache';
import type { PriceCacheWrite } from './supabasePriceCache';

const PRICE_SOURCE = 'stax_mvp';
const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

// When CoinGecko starts returning rate limits or auth errors, we temporarily
// disable CoinGecko usage in this client process to avoid hammering it.
let coinGeckoTemporarilyDisabled = false;

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
  /** Ethplorer-provided USD price (used as fallback for DeFi/obscure tokens). */
  ethplorerPrice?: number;
  /** Underlying token symbol for DeFi receipt tokens (e.g. "USDC" for aEthUSDC). */
  underlyingSymbol?: string;
}

// ---------------------------------------------------------------------------
// DeFi token → underlying symbol resolver
// ---------------------------------------------------------------------------

/**
 * Attempt to resolve a DeFi derivative token symbol to its underlying token.
 * Covers Aave aTokens, Compound cTokens, Lido stTokens, wrapped tokens, etc.
 *
 * Returns the underlying symbol or null if no mapping is found.
 */
export function resolveUnderlyingSymbol(symbol: string): string | null {
  const s = symbol.toUpperCase();

  // Aave v3 aTokens: aEthUSDC → USDC, aEthWETH → WETH, aEthDAI → DAI
  const aaveV3Match = s.match(/^A(?:ETH|ARB|OP|POLY|AVAX|BASE)?([A-Z]+)$/);
  if (aaveV3Match) {
    const underlying = aaveV3Match[1];
    // Sanity check: avoid matching short tokens that happen to start with A (like AAVE, APT, ATOM)
    if (underlying.length >= 2 && s.length > underlying.length + 1) {
      return underlying;
    }
  }

  // Compound cTokens: cUSDC → USDC, cDAI → DAI, cETH → ETH
  if (s.startsWith('C') && s.length > 2) {
    const underlying = s.slice(1);
    // Only match common patterns (cUSDC, cDAI, cETH, cWBTC, etc.)
    if (/^(USDC|DAI|ETH|WBTC|USDT|UNI|LINK|COMP|AAVE|BAT|ZRX|TUSD|SUSHI|MKR)$/.test(underlying)) {
      return underlying;
    }
  }

  // Lido staked tokens: stETH → ETH, stMATIC → MATIC, stSOL → SOL
  if (s.startsWith('ST') && s.length > 3) {
    const underlying = s.slice(2);
    if (/^(ETH|MATIC|SOL|AVAX|DOT|ATOM|NEAR)$/.test(underlying)) {
      return underlying;
    }
  }

  // Wrapped tokens: WETH → ETH, WBTC → BTC, WMATIC → MATIC
  if (s.startsWith('W') && s.length > 2) {
    const underlying = s.slice(1);
    if (/^(ETH|BTC|MATIC|AVAX|BNB|SOL|FTM|ONE)$/.test(underlying)) {
      return underlying;
    }
  }

  return null;
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
    console.log(
      `[Pricing] ${normalizedSymbol}: from Supabase cache (${cached.source}, age=${timeSince(cached.updatedAt)})`
    );
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
  // If CoinGecko is temporarily disabled due to rate limits/auth errors,
  // skip all CoinGecko calls and only try CoinMarketCap + Ethplorer.
  if (coinGeckoTemporarilyDisabled) {
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
    const rawEthplorerPrice = metadata?.ethplorerPrice;
    const ethplorerPrice =
      typeof rawEthplorerPrice === 'number'
        ? rawEthplorerPrice
        : typeof rawEthplorerPrice === 'string'
          ? parseFloat(rawEthplorerPrice)
          : NaN;
    if (!Number.isNaN(ethplorerPrice) && ethplorerPrice > 0) {
      return { price: ethplorerPrice, currency: 'USD', symbol };
    }
    return null;
  }

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
    const urlBySymbol = `${baseUrl}/simple/price?symbols=${encodeURIComponent(
      sym,
    )}&vs_currencies=usd&include_24hr_change=true&include_tokens=all`;
    const res = await fetch(urlBySymbol, { headers });
    const data = (await res.json()) as Record<
      string,
      { usd?: number; usd_24h_change?: number | null }
    >;
    const candidate =
      data[sym] ?? data[symbol] ?? data[symbol.toUpperCase()] ?? Object.values(data)[0];
    const usd = candidate?.usd;
    if (usd != null) {
      const changePercent =
        candidate?.usd_24h_change != null ? candidate.usd_24h_change : undefined;
      return {
        price: usd,
        currency: 'USD',
        symbol,
        ...(changePercent != null && { changePercent }),
      };
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

    // DeFi derivative tokens: try pricing the underlying (aEthUSDC → USDC, stETH → ETH, etc.)
    const underlying = (metadata?.underlyingSymbol as string) ?? resolveUnderlyingSymbol(symbol);
    if (underlying && underlying.toUpperCase() !== symbol.toUpperCase()) {
      const underlyingId = await getCoinGeckoId(underlying);
      if (underlyingId) {
        const result = await fetchCoinGeckoPriceById(underlyingId, symbol, baseUrl, headers);
        if (result) return result;
      }
    }

    // Last resort: use Ethplorer-provided price from metadata (wallet imports)
    // May be stored as number (fresh) or string (from DB serialization)
    const rawEthplorerPrice = metadata?.ethplorerPrice;
    const ethplorerPrice =
      typeof rawEthplorerPrice === 'number'
        ? rawEthplorerPrice
        : typeof rawEthplorerPrice === 'string'
          ? parseFloat(rawEthplorerPrice)
          : NaN;
    if (!Number.isNaN(ethplorerPrice) && ethplorerPrice > 0) {
      return { price: ethplorerPrice, currency: 'USD', symbol };
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
  const data = (await res.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number | null }
  >;
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
  const data = (await res.json()) as Record<
    string,
    { usd?: number; usd_24h_change?: number | null }
  >;
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
        const data = (await res.json()) as Record<
          string,
          { usd?: number; usd_24h_change?: number | null }
        >;
        const coin = data[coinGeckoId];
        if (coin?.usd != null) {
          const changePercent = coin.usd_24h_change != null ? coin.usd_24h_change : undefined;
          return {
            price: coin.usd,
            currency: 'USD',
            symbol,
            ...(changePercent != null && { changePercent }),
          };
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
  originalSymbol: string
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
 * Crypto symbols are batched into a single CoinGecko call to avoid rate limits.
 * All results are upserted into the local SQLite PricePoint table.
 */
export async function refreshPrices(
  db: SQLiteDatabase,
  items: { symbol: string; type: AssetTypeListed; metadata?: PriceMetadata }[]
): Promise<void> {
  const points: PricePoint[] = [];
  const freshFromApi: PriceCacheWrite[] = []; // prices fetched from APIs to write back to Supabase
  const now = new Date().toISOString();

  // 1. Batch-read from Supabase cache
  const allSymbols = items.map((i) => normalizeSymbol(i.symbol));
  const supabasePrices = await getCachedPrices(allSymbols);

  // 2. Separate items into cached, crypto (batchable), and other
  const uncachedCrypto: { symbol: string; type: AssetTypeListed; metadata?: PriceMetadata }[] = [];
  const uncachedOther: { symbol: string; type: AssetTypeListed; metadata?: PriceMetadata }[] = [];

  for (const { symbol, type, metadata } of items) {
    const normalizedSymbol = normalizeSymbol(symbol);

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

    if (type === 'crypto') {
      uncachedCrypto.push({ symbol: normalizedSymbol, type, metadata });
    } else {
      uncachedOther.push({ symbol: normalizedSymbol, type, metadata });
    }
  }

  /** Helper: record a fresh API result for both local DB and Supabase write-back. */
  const recordApiResult = (result: PriceResult, assetType: string) => {
    const sym = normalizeSymbol(result.symbol);
    points.push({
      symbol: sym,
      timestamp: now,
      price: result.price,
      currency: result.currency,
      source: PRICE_SOURCE,
      ...(result.previousClose != null && { previousClose: result.previousClose }),
      ...(result.changePercent != null && { changePercent: result.changePercent }),
    });
    freshFromApi.push({
      symbol: sym,
      price: result.price,
      currency: result.currency,
      previousClose: result.previousClose,
      changePercent: result.changePercent,
      assetType,
      source: PRICE_SOURCE,
    });
  };

  // 3. Batch-fetch crypto prices via a single CoinGecko ids= call
  if (uncachedCrypto.length > 0) {
    const batchResults = await fetchCryptoPricesBatch(
      uncachedCrypto.map((c) => ({ symbol: c.symbol, metadata: c.metadata }))
    );
    for (const result of batchResults) {
      recordApiResult(result, 'crypto');
    }
  }

  // 4. Fetch non-crypto prices individually (stocks, ETFs, metals, commodities)
  for (const { symbol, type, metadata } of uncachedOther) {
    const result = await fetchLatestPrice(symbol, type, metadata);
    if (
      result &&
      typeof result.price === 'number' &&
      Number.isFinite(result.price) &&
      result.price > 0
    ) {
      recordApiResult(result, type);
    }
  }

  if (points.length > 0) {
    await pricePointRepo.upsertMany(db, points);
  }

  // Write API-fetched prices back to Supabase so the cache is populated
  // for future reads and for the Edge Function's benefit.
  if (freshFromApi.length > 0) {
    writeCachedPrices(freshFromApi).catch(() => {
      // Non-blocking: if Supabase write fails, local DB still has the data
    });
  }
}

/**
 * Batch-fetch crypto prices: resolves CoinGecko IDs, then makes one API call
 * for up to 50 coins at a time. Falls back to individual lookups for failures.
 */
async function fetchCryptoPricesBatch(
  coins: { symbol: string; metadata?: PriceMetadata }[]
): Promise<PriceResult[]> {
  const { baseUrl, apiKey, headerName } = getCoinGeckoConfig();
  const headers: Record<string, string> = {};
  if (apiKey) headers[headerName] = apiKey;
  const results: PriceResult[] = [];

  // Resolve CoinGecko IDs for each symbol
  const idToSymbol = new Map<string, string>();
  const noIdCoins: { symbol: string; metadata?: PriceMetadata }[] = [];

  for (const { symbol, metadata } of coins) {
    // Use providerId from metadata if available (most reliable)
    const providerId = metadata?.providerId?.trim();
    if (providerId) {
      idToSymbol.set(providerId, symbol);
      continue;
    }
    // Try contract address route individually (can't batch these)
    const contractAddress = metadata?.contractAddress?.trim();
    if (contractAddress) {
      noIdCoins.push({ symbol, metadata });
      continue;
    }
    // Resolve via coins list
    const id = await getCoinGeckoId(symbol);
    if (id) {
      idToSymbol.set(id, symbol);
    } else {
      noIdCoins.push({ symbol, metadata });
    }
  }

  // Batch fetch by IDs (CoinGecko supports up to ~100 ids per call)
  if (!coinGeckoTemporarilyDisabled && idToSymbol.size > 0) {
    const BATCH = 50;
    const idEntries = Array.from(idToSymbol.entries());
    for (let i = 0; i < idEntries.length; i += BATCH) {
      const batch = idEntries.slice(i, i + BATCH);
      const ids = batch.map(([id]) => id).join(',');
      try {
        const url = `${baseUrl}/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=usd&include_24hr_change=true`;
        const res = await fetch(url, { headers });
        if (res.ok) {
          const data = (await res.json()) as Record<
            string,
            { usd?: number; usd_24h_change?: number | null }
          >;
          for (const [id, sym] of batch) {
            const coin = data[id];
            if (coin?.usd != null) {
              const changePercent = coin.usd_24h_change != null ? coin.usd_24h_change : undefined;
              results.push({
                price: coin.usd,
                currency: 'USD',
                symbol: sym,
                ...(changePercent != null && { changePercent }),
              });
            } else {
              // ID resolved but no price data — try individually
              noIdCoins.push({ symbol: sym });
            }
          }
        } else {
          console.warn(`[Pricing] Batch CoinGecko failed: ${res.status}`);
          if (res.status === 429 || res.status === 401) {
            // Rate limited or unauthorized – stop using CoinGecko for the rest
            // of this app session and rely on Supabase/CMC/Ethplorer instead.
            coinGeckoTemporarilyDisabled = true;
          }
          // Push all to individual fallback
          for (const [, sym] of batch) {
            noIdCoins.push({ symbol: sym });
          }
        }
      } catch (err) {
        console.warn('[Pricing] Batch CoinGecko error:', err);
        for (const [, sym] of batch) {
          noIdCoins.push({ symbol: sym });
        }
      }
    }
  }

  // Individual fallback for coins that couldn't be batched
  for (const { symbol, metadata } of noIdCoins) {
    const result = await fetchCryptoPrice(symbol, metadata);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Get latest price for a symbol from local DB, or fetch from APIs and cache
 * in both local SQLite AND Supabase price_cache.
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
    // Save to local SQLite
    await pricePointRepo.upsert(db, {
      symbol: normalizeSymbol(result.symbol),
      timestamp: new Date().toISOString(),
      price: result.price,
      currency: result.currency,
      source: PRICE_SOURCE,
      ...(result.previousClose != null && { previousClose: result.previousClose }),
      ...(result.changePercent != null && { changePercent: result.changePercent }),
    });
    // Also write to Supabase price_cache (non-blocking)
    writeCachedPrices([
      {
        symbol: normalizeSymbol(result.symbol),
        price: result.price,
        currency: result.currency,
        previousClose: result.previousClose,
        changePercent: result.changePercent,
        assetType: type,
        source: PRICE_SOURCE,
      },
    ]).catch(() => {});
  }
  return result;
}
