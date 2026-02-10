import { useState, useEffect } from 'react';
import type { Holding } from '../../../data/schemas';
import { getPriceTarget, type PriceTarget } from '../../../services/finnhub';

export interface PriceTargetSummary {
  symbol: string;
  holdingName: string;
  holdingId: string;
  target: PriceTarget;
}

const MAX_SYMBOLS = 15;
const BATCH_SIZE = 5;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Hook to fetch analyst price target consensus for stock/ETF holdings.
 */
export function usePriceTargets(holdings: Holding[]) {
  const [targets, setTargets] = useState<PriceTargetSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const eligible = holdings.filter(
      (h) => (h.type === 'stock' || h.type === 'etf') && h.symbol
    );
    if (eligible.length === 0) {
      setTargets([]);
      return;
    }

    const toFetch = eligible.slice(0, MAX_SYMBOLS);

    (async () => {
      setLoading(true);
      const results: PriceTargetSummary[] = [];

      for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
        if (cancelled) break;
        const batch = toFetch.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (h) => {
            try {
              const target = await getPriceTarget(h.symbol!);
              if (!target) return null;
              return {
                symbol: h.symbol!,
                holdingName: h.name,
                holdingId: h.id,
                target,
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
        setTargets(results);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [holdings]);

  return { targets, priceTargetsLoading: loading };
}
