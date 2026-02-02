import { useCallback, useState, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo, holdingRepo, pricePointRepo, portfolioValueSnapshotRepo } from '../../data';
import type { Portfolio, Holding } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';
import { refreshPrices } from '../../services/pricing';
import type { AssetTypeListed } from '../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { portfolioTotalBase } from './portfolioUtils';

export interface PortfolioState {
  portfolio: Portfolio | null;
  holdings: Holding[];
  pricesBySymbol: Map<string, PriceResult>;
  totalBase: number;
  loading: boolean;
  error: string | null;
}

function pricePointToResult(pp: { price: number; currency: string; symbol: string; previousClose?: number | null; changePercent?: number | null }): PriceResult | null {
  if (typeof pp.price !== 'number' || !Number.isFinite(pp.price) || pp.price <= 0) return null;
  return {
    price: pp.price,
    currency: pp.currency,
    symbol: pp.symbol,
    ...(pp.previousClose != null && { previousClose: pp.previousClose }),
    ...(pp.changePercent != null && { changePercent: pp.changePercent }),
  };
}

/**
 * Load default portfolio, its holdings, and latest prices. Shows cached prices first, then refreshes in background so the UI stays stable.
 */
export function usePortfolio() {
  const db = useSQLiteContext();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [pricesBySymbol, setPricesBySymbol] = useState<Map<string, PriceResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const p = await portfolioRepo.getById(db, DEFAULT_PORTFOLIO_ID);
      if (!p) {
        setPortfolio(null);
        setHoldings([]);
        setPricesBySymbol(new Map());
        setLoading(false);
        return;
      }
      setPortfolio(p);
      const h = await holdingRepo.getByPortfolioId(db, p.id);
      setHoldings(h);

      const listed = h.filter(
        (x): x is Holding & { symbol: string; type: AssetTypeListed } =>
          x.symbol != null && ['stock', 'etf', 'crypto', 'metal', 'commodity'].includes(x.type)
      );
      const symbols = Array.from(new Set(listed.map((x) => x.symbol)));

      // Show cached prices immediately so UI doesn't flash or drop
      const cachedMap = await pricePointRepo.getLatestBySymbols(db, symbols);
      const cachedResult = new Map<string, PriceResult>();
      Array.from(cachedMap.entries()).forEach(([sym, pp]) => {
        const pr = pricePointToResult(pp);
        if (pr) cachedResult.set(sym, pr);
      });
      setPricesBySymbol(cachedResult);
      setLoading(false);

      let snapshotMap = cachedResult;
      if (listed.length > 0) {
        await refreshPrices(
          db,
          listed.map((x) => ({
            symbol: x.symbol,
            type: x.type as AssetTypeListed,
            metadata: x.metadata ?? undefined,
          }))
        );
        const priceMapAfter = await pricePointRepo.getLatestBySymbols(db, symbols);
        const resultMap = new Map<string, PriceResult>();
        Array.from(priceMapAfter.entries()).forEach(([sym, pp]) => {
          const pr = pricePointToResult(pp);
          if (pr) resultMap.set(sym, pr);
        });
        setPricesBySymbol((prev) => {
          const next = new Map(prev);
          Array.from(resultMap.entries()).forEach(([sym, pr]) => next.set(sym, pr));
          return next;
        });
        snapshotMap = resultMap;
      }
      const totalBaseNow = portfolioTotalBase(h, snapshotMap, p.baseCurrency);
      await portfolioValueSnapshotRepo.insert(db, {
        portfolioId: p.id,
        timestamp: new Date().toISOString(),
        valueBase: totalBaseNow,
        baseCurrency: p.baseCurrency,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const totalBase = portfolio
    ? portfolioTotalBase(holdings, pricesBySymbol, portfolio.baseCurrency)
    : 0;

  return {
    portfolio,
    holdings,
    pricesBySymbol,
    totalBase,
    loading,
    error,
    refresh: load,
  };
}
