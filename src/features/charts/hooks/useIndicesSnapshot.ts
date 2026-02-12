import { useState, useEffect } from 'react';
import { getCachedPrices } from '../../../services/supabasePriceCache';

export const INDICES_SYMBOLS = ['SPY', 'QQQ', 'AGG', 'GLD'] as const;

export interface IndexSnapshot {
  symbol: string;
  label: string;
  color: string;
  changePercent: number | null;
  price: number | null;
}

const INDICES_CONFIG: Array<{ symbol: string; label: string; color: string }> = [
  { symbol: 'SPY', label: 'S&P 500', color: '#4ECDC4' },
  { symbol: 'QQQ', label: 'NASDAQ', color: '#F59E0B' },
  { symbol: 'AGG', label: 'Bonds', color: '#22C55E' },
  { symbol: 'GLD', label: 'Gold', color: '#FBBF24' },
];

/**
 * Fetches benchmark indices from Supabase price cache only (no direct API calls).
 * Used for "Indices at a glance" so we avoid rate limits from Finnhub/Alpha Vantage.
 * Cache is populated by the refresh-prices Edge Function (includes SPY, QQQ, AGG, GLD).
 */
export function useIndicesSnapshot(): {
  indices: IndexSnapshot[];
  loading: boolean;
} {
  const [indices, setIndices] = useState<IndexSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getCachedPrices(INDICES_SYMBOLS.slice())
      .then((cache) => {
        if (cancelled) return;
        const list: IndexSnapshot[] = INDICES_CONFIG.map((cfg) => {
          const c = cache.get(cfg.symbol);
          return {
            symbol: cfg.symbol,
            label: cfg.label,
            color: cfg.color,
            changePercent: c?.changePercent ?? null,
            price: c?.price ?? null,
          };
        });
        setIndices(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { indices, loading };
}
