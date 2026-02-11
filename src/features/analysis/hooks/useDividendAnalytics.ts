import { useMemo } from 'react';
import type { Holding, Transaction } from '../../../data/schemas';
import {
  totalDividendIncome,
  monthlyDividendIncome,
  dividendsByHolding,
} from '../../portfolio/portfolioUtils';

export interface DividendHoldingRow {
  holdingId: string;
  name: string;
  symbol: string | null;
  ttmAmount: number;
  yieldOnCost: number | null;
}

export interface DividendAnalytics {
  ttmIncome: number;
  monthlyData: { month: string; amount: number }[];
  holdingRows: DividendHoldingRow[];
}

/**
 * Compute dividend analytics from transactions and holdings.
 * TTM income, monthly breakdown (last 12 months), per-holding yield-on-cost.
 */
export function useDividendAnalytics(
  transactions: Transaction[],
  holdings: Holding[],
): DividendAnalytics {
  return useMemo(() => {
    const dividends = transactions.filter((t) => t.type === 'dividend');
    const ttmIncome = totalDividendIncome(dividends.filter((t) => {
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
      return t.date >= twelveMonthsAgo.toISOString();
    }));

    const monthlyData = monthlyDividendIncome(transactions, 12);
    const byHolding = dividendsByHolding(transactions);

    const holdingsMap = new Map(holdings.map((h) => [h.id, h]));
    const holdingRows: DividendHoldingRow[] = [];

    for (const [holdingId, ttmAmount] of byHolding) {
      const holding = holdingsMap.get(holdingId);
      if (!holding) continue;

      // TTM amount for this holding (filter to last 12 months)
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
      const holdingTtm = transactions
        .filter((t) => t.type === 'dividend' && t.holdingId === holdingId && t.date >= twelveMonthsAgo.toISOString())
        .reduce((s, t) => s + t.totalAmount, 0);

      const yieldOnCost =
        holding.costBasis != null && holding.costBasis > 0
          ? (holdingTtm / holding.costBasis) * 100
          : null;

      holdingRows.push({
        holdingId,
        name: holding.name,
        symbol: holding.symbol ?? null,
        ttmAmount: holdingTtm,
        yieldOnCost,
      });
    }

    holdingRows.sort((a, b) => b.ttmAmount - a.ttmAmount);

    return { ttmIncome, monthlyData, holdingRows };
  }, [transactions, holdings]);
}
