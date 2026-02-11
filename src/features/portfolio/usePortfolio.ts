import { useCallback, useState, useEffect, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo, holdingRepo, pricePointRepo, portfolioValueSnapshotRepo, transactionRepo } from '../../data';
import {
  getActivePortfolioId,
  setActivePortfolioId as persistActivePortfolioId,
} from '../../data/activePortfolioStorage';
import type { Portfolio, Holding, Transaction } from '../../data/schemas';
import type { PriceResult } from '../../services/pricing';
import { refreshPrices } from '../../services/pricing';
import type { AssetTypeListed } from '../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { portfolioTotalBase } from './portfolioUtils';
import { fetchFxRates } from '../../services/fxRates';

export interface PortfolioState {
  portfolio: Portfolio | null;
  holdings: Holding[];
  pricesBySymbol: Map<string, PriceResult>;
  totalBase: number;
  loading: boolean;
  error: string | null;
}

function pricePointToResult(pp: {
  price: number;
  currency: string;
  symbol: string;
  previousClose?: number | null;
  changePercent?: number | null;
}): PriceResult | null {
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
 * Resolve the active portfolio id: from storage, or fallback to default/first active.
 */
async function resolveActivePortfolioId(db: import('expo-sqlite').SQLiteDatabase): Promise<string> {
  const stored = await getActivePortfolioId();
  const list = await portfolioRepo.listActive(db);
  if (stored && list.some((p) => p.id === stored)) return stored;
  const first = list.find((p) => p.id === DEFAULT_PORTFOLIO_ID) ?? list[0];
  const fallback = first?.id ?? DEFAULT_PORTFOLIO_ID;
  await persistActivePortfolioId(fallback);
  return fallback;
}

/**
 * Load active portfolio, its holdings, and latest prices. Shows cached prices first, then refreshes in background.
 * Exposes multi-portfolio APIs: switch portfolio, list, create, rename, archive.
 */
export function usePortfolio() {
  const db = useSQLiteContext();
  const dbRef = useRef(db);
  dbRef.current = db;

  const [activePortfolioId, setActivePortfolioIdState] = useState<string | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [pricesBySymbol, setPricesBySymbol] = useState<Map<string, PriceResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fxRates, setFxRates] = useState<Record<string, number> | undefined>(undefined);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [valueHistory, setValueHistory] = useState<
    { timestamp: string; valueBase: number; baseCurrency: string }[]
  >([]);

  const load = useCallback(async (portfolioId: string) => {
    try {
      setLoading(true);
      setError(null);
      const p = await portfolioRepo.getById(dbRef.current, portfolioId);
      if (!p || p.archivedAt) {
        setPortfolio(null);
        setHoldings([]);
        setPricesBySymbol(new Map());
        setValueHistory([]);
        setLoading(false);
        return;
      }
      setPortfolio(p);
      const [h, txns] = await Promise.all([
        holdingRepo.getByPortfolioId(dbRef.current, p.id),
        transactionRepo.getByPortfolioId(dbRef.current, p.id),
      ]);
      setHoldings(h);
      setTransactions(txns);

      const listed = h.filter(
        (x): x is Holding & { symbol: string; type: AssetTypeListed } =>
          x.symbol != null && ['stock', 'etf', 'crypto', 'metal', 'commodity'].includes(x.type)
      );
      const symbols = Array.from(new Set(listed.map((x) => x.symbol)));

      const cachedMap = await pricePointRepo.getLatestBySymbols(dbRef.current, symbols);
      const cachedResult = new Map<string, PriceResult>();
      Array.from(cachedMap.entries()).forEach(([sym, pp]) => {
        const pr = pricePointToResult(pp);
        if (pr) cachedResult.set(sym, pr);
      });
      setPricesBySymbol(cachedResult);
      setLoading(false);

      // Fetch live FX rates (non-blocking — falls back to stubs if unavailable)
      const rates = (await fetchFxRates()) ?? undefined;
      setFxRates(rates);

      let snapshotMap = cachedResult;
      if (listed.length > 0) {
        await refreshPrices(
          dbRef.current,
          listed.map((x) => ({
            symbol: x.symbol,
            type: x.type as AssetTypeListed,
            metadata: x.metadata ?? undefined,
          }))
        );
        const priceMapAfter = await pricePointRepo.getLatestBySymbols(dbRef.current, symbols);
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
      const totalBaseNow = portfolioTotalBase(h, snapshotMap, p.baseCurrency, rates);
      await portfolioValueSnapshotRepo.insert(dbRef.current, {
        portfolioId: p.id,
        timestamp: new Date().toISOString(),
        valueBase: totalBaseNow,
        baseCurrency: p.baseCurrency,
      });

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const snapshots = await portfolioValueSnapshotRepo.getByPortfolioSince(
        dbRef.current,
        p.id,
        since.toISOString()
      );
      setValueHistory(
        snapshots.map((s) => ({
          timestamp: s.timestamp,
          valueBase: s.valueBase,
          baseCurrency: s.baseCurrency,
        }))
      );

      const activeList = await portfolioRepo.listActive(dbRef.current);
      setPortfolios(activeList);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await resolveActivePortfolioId(dbRef.current);
      if (cancelled) return;
      setActivePortfolioIdState(id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activePortfolioId) loadRef.current(activePortfolioId);
  }, [activePortfolioId]);

  const switchPortfolio = useCallback(async (id: string) => {
    await persistActivePortfolioId(id);
    setActivePortfolioIdState(id);
  }, []);

  const createPortfolio = useCallback(async (name: string, baseCurrency: string) => {
    const created = await portfolioRepo.create(dbRef.current, { name, baseCurrency });
    const list = await portfolioRepo.listActive(dbRef.current);
    setPortfolios(list);
    await persistActivePortfolioId(created.id);
    setActivePortfolioIdState(created.id);
    return created;
  }, []);

  const renamePortfolio = useCallback(
    async (id: string, name: string) => {
      const updated = await portfolioRepo.update(dbRef.current, id, { name });
      if (updated) {
        const list = await portfolioRepo.listActive(dbRef.current);
        setPortfolios(list);
        if (id === activePortfolioId) setPortfolio(updated);
      }
      return updated;
    },
    [activePortfolioId]
  );

  const archivePortfolio = useCallback(
    async (id: string) => {
      const archived = await portfolioRepo.archive(dbRef.current, id);
      if (!archived) return null;
      const list = await portfolioRepo.listActive(dbRef.current);
      setPortfolios(list);
      if (id === activePortfolioId) {
        const next = list[0]?.id ?? DEFAULT_PORTFOLIO_ID;
        await persistActivePortfolioId(next);
        setActivePortfolioIdState(next);
      }
      return archived;
    },
    [activePortfolioId]
  );

  const refresh = useCallback(() => {
    if (activePortfolioId) load(activePortfolioId);
  }, [activePortfolioId, load]);

  const totalBase = portfolio
    ? portfolioTotalBase(holdings, pricesBySymbol, portfolio.baseCurrency, fxRates)
    : 0;

  return {
    portfolio,
    holdings,
    pricesBySymbol,
    totalBase,
    loading,
    error,
    refresh,
    activePortfolioId,
    switchPortfolio,
    portfolios,
    createPortfolio,
    renamePortfolio,
    archivePortfolio,
    transactions,
    valueHistory,
    fxRates,
  };
}
