import { useState, useEffect } from 'react';
import type { Holding } from '../../../data/schemas';
import { getInsiderSentiment, type InsiderSentimentData } from '../../../services/finnhub';

export interface InsiderSummary {
  symbol: string;
  holdingName: string;
  holdingId: string;
  /** Most recent monthly MSPR. Positive = net insider buying. */
  latestMspr: number;
  /** Human-readable label. */
  signal: 'Net Buying' | 'Net Selling' | 'Neutral';
  /** Raw recent data points for potential charting. */
  data: InsiderSentimentData[];
}

const MAX_SYMBOLS = 15;
const BATCH_SIZE = 5;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Hook to fetch insider sentiment for stock/ETF holdings.
 */
export function useInsiderSentiment(holdings: Holding[]) {
  const [insiders, setInsiders] = useState<InsiderSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const eligible = holdings.filter(
      (h) => (h.type === 'stock' || h.type === 'etf') && h.symbol
    );
    if (eligible.length === 0) {
      setInsiders([]);
      return;
    }

    const toFetch = eligible.slice(0, MAX_SYMBOLS);

    (async () => {
      setLoading(true);
      const results: InsiderSummary[] = [];

      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (h) => {
            try {
              const data = await getInsiderSentiment(h.symbol!);
              if (data.length === 0) return null;
              const latest = data[data.length - 1];
              const signal: InsiderSummary['signal'] =
                latest.mspr > 5 ? 'Net Buying' : latest.mspr < -5 ? 'Net Selling' : 'Neutral';
              return {
                symbol: h.symbol!,
                holdingName: h.name,
                holdingId: h.id,
                latestMspr: latest.mspr,
                signal,
                data,
              };
            } catch {
              return null;
            }
          })
        );
        for (const r of batchResults) {
          if (r) results.push(r);
        }
        if (i + BATCH_SIZE < toFetch.length) await delay(300);
      }

      if (!cancelled) {
        setInsiders(results);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holdings]);

  return { insiders, insiderLoading: loading };
}
