import { useCallback, useEffect, useState } from 'react';
import {
  getRecommendationTrends,
  isFinnhubConfigured,
  type RecommendationTrend,
} from '../../../services/finnhub';
import type { Holding } from '../../../data/schemas';

export interface SentimentSummary {
  symbol: string;
  holdingName: string;
  holdingId: string;
  /** Latest recommendation snapshot. */
  latest: RecommendationTrend;
  /** Overall label derived from buy/hold/sell counts. */
  consensus: 'Strong Buy' | 'Buy' | 'Hold' | 'Sell' | 'Strong Sell';
  /** Total analyst count. */
  totalAnalysts: number;
  /** Bullish percentage (strongBuy + buy) / total. */
  bullishPct: number;
}

function deriveConsensus(t: RecommendationTrend): SentimentSummary['consensus'] {
  const total = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
  if (total === 0) return 'Hold';
  const score =
    (t.strongBuy * 5 + t.buy * 4 + t.hold * 3 + t.sell * 2 + t.strongSell * 1) / total;
  if (score >= 4.5) return 'Strong Buy';
  if (score >= 3.5) return 'Buy';
  if (score >= 2.5) return 'Hold';
  if (score >= 1.5) return 'Sell';
  return 'Strong Sell';
}

/**
 * Fetch analyst recommendation trends for all stock/ETF holdings in the portfolio.
 * Returns a summary per holding, sorted by bullish % desc.
 */
export function useRecommendationTrends(holdings: Holding[]) {
  const [summaries, setSummaries] = useState<SentimentSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isFinnhubConfigured()) return;

    const stockEtf = holdings.filter(
      (h) => h.symbol && (h.type === 'stock' || h.type === 'etf')
    );
    if (stockEtf.length === 0) {
      setSummaries([]);
      return;
    }

    setLoading(true);

    // Cap to 15 symbols to stay within free-tier limits
    const toFetch = stockEtf.slice(0, 15);
    const results: SentimentSummary[] = [];

    // Fetch in batches of 5
    for (let i = 0; i < toFetch.length; i += 5) {
      const batch = toFetch.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (h) => {
          const trends = await getRecommendationTrends(h.symbol!);
          if (trends.length === 0) return null;
          const latest = trends[0];
          const total =
            latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
          if (total === 0) return null;
          const bullishPct = ((latest.strongBuy + latest.buy) / total) * 100;
          return {
            symbol: h.symbol!,
            holdingName: h.name,
            holdingId: h.id,
            latest,
            consensus: deriveConsensus(latest),
            totalAnalysts: total,
            bullishPct,
          };
        })
      );
      for (const r of batchResults) {
        if (r) results.push(r);
      }
    }

    results.sort((a, b) => b.bullishPct - a.bullishPct);
    setSummaries(results);
    setLoading(false);
  }, [holdings]);

  useEffect(() => {
    load();
  }, [load]);

  return { sentiments: summaries, sentimentLoading: loading, refreshSentiment: load };
}
