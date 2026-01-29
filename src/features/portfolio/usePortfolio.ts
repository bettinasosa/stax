import { useCallback, useState, useEffect } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo, holdingRepo, pricePointRepo } from '../../data';
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

/**
 * Load default portfolio, its holdings, and latest prices. Refreshes prices on pull.
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
        return;
      }
      setPortfolio(p);
      const h = await holdingRepo.getByPortfolioId(db, p.id);
      setHoldings(h);

      const listed = h.filter(
        (x): x is Holding & { symbol: string; type: AssetTypeListed } =>
          x.symbol != null && ['stock', 'etf', 'crypto', 'metal'].includes(x.type)
      );
      if (listed.length > 0) {
        await refreshPrices(
          db,
          listed.map((x) => ({ symbol: x.symbol, type: x.type as AssetTypeListed }))
        );
      }

      const symbols = [...new Set(listed.map((x) => x.symbol))];
      const priceMap = await pricePointRepo.getLatestBySymbols(db, symbols);
      const resultMap = new Map<string, PriceResult>();
      for (const [sym, pp] of priceMap) {
        resultMap.set(sym, { price: pp.price, currency: pp.currency, symbol: pp.symbol });
      }
      setPricesBySymbol(resultMap);
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
