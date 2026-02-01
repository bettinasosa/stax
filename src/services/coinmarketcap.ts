/**
 * CoinMarketCap API: latest crypto quotes (optional fallback).
 * Requires EXPO_PUBLIC_COINMARKETCAP_API_KEY.
 * @see https://coinmarketcap.com/api/documentation/v1/
 */

const CMC_BASE = 'https://pro-api.coinmarketcap.com/v1';

interface CoinMarketCapQuoteResponse {
  data?: Record<
    string,
    {
      quote?: {
        USD?: {
          price?: number;
          percent_change_24h?: number;
        };
      };
    }
  >;
}

export interface CoinMarketCapPrice {
  price: number;
  changePercent?: number;
}

function getApiKey(): string | undefined {
  return process.env.EXPO_PUBLIC_COINMARKETCAP_API_KEY?.trim() || undefined;
}

export function isCoinMarketCapConfigured(): boolean {
  return !!getApiKey();
}

/**
 * Fetch latest USD price for a symbol from CoinMarketCap.
 * Returns null if not configured, symbol not found, or request fails.
 */
export async function getCoinMarketCapPrice(symbol: string): Promise<CoinMarketCapPrice | null> {
  const apiKey = getApiKey();
  if (!apiKey || !symbol.trim()) return null;
  const sym = symbol.trim().toUpperCase();

  try {
    const url = `${CMC_BASE}/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(sym)}&convert=USD`;
    const res = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CoinMarketCapQuoteResponse;
    const quote = data.data?.[sym]?.quote?.USD;
    const price = quote?.price;
    if (price == null) return null;
    const changePercent = quote?.percent_change_24h;
    return { price, ...(changePercent != null && { changePercent }) };
  } catch {
    return null;
  }
}
