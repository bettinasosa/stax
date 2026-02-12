import { useState, useEffect, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioValueSnapshotRepo } from '../../../data';
import type { PortfolioValueSnapshot } from '../../../data/schemas';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';

const TIME_WINDOW_DAYS: Record<TimeWindow, number> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  'ALL': 365,
};

export interface PortfolioComparisonSeries {
  portfolioId: string;
  portfolioName: string;
  color: string;
  returns: number[];
}

const COLORS = ['#FFFFFF', '#4ECDC4', '#F59E0B', '#22C55E', '#A78BFA'];

/**
 * Loads value snapshots for multiple portfolios and normalizes to % returns,
 * aligned to the primary portfolio's timestamps.
 */
export function usePortfolioComparison(
  portfolioIds: string[],
  portfolioNames: Record<string, string>,
  timeWindow: TimeWindow,
) {
  const db = useSQLiteContext();
  const [snapsByPortfolio, setSnapsByPortfolio] = useState<Map<string, PortfolioValueSnapshot[]>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (portfolioIds.length === 0) {
      setSnapsByPortfolio(new Map());
      return;
    }

    let cancelled = false;
    setLoading(true);

    const days = TIME_WINDOW_DAYS[timeWindow];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    Promise.all(
      portfolioIds.map((id) =>
        portfolioValueSnapshotRepo.getByPortfolioSince(db, id, sinceISO).then((snaps) => ({ id, snaps })),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, PortfolioValueSnapshot[]>();
        for (const { id, snaps } of results) {
          map.set(id, snaps);
        }
        setSnapsByPortfolio(map);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [db, portfolioIds.join(','), timeWindow]);

  const result = useMemo(() => {
    if (portfolioIds.length === 0) {
      return { series: [], labels: null };
    }

    // Use the primary (first) portfolio's timestamps as the x-axis reference
    const primarySnaps = snapsByPortfolio.get(portfolioIds[0]);
    if (!primarySnaps || primarySnaps.length < 2) {
      return { series: [], labels: null };
    }

    const series: PortfolioComparisonSeries[] = [];

    for (let idx = 0; idx < portfolioIds.length; idx++) {
      const pid = portfolioIds[idx];
      const snaps = snapsByPortfolio.get(pid);
      if (!snaps || snaps.length < 2) continue;

      const startVal = snaps[0].valueBase;
      if (startVal === 0) continue;

      // Align to primary timestamps using nearest-before interpolation
      const returns: number[] = [];
      for (const refSnap of primarySnaps) {
        const refTs = new Date(refSnap.timestamp).getTime();
        const nearest = findNearestBefore(snaps, refTs);
        if (nearest !== null) {
          returns.push(((nearest.valueBase - startVal) / startVal) * 100);
        } else {
          returns.push(returns.length > 0 ? returns[returns.length - 1] : 0);
        }
      }

      series.push({
        portfolioId: pid,
        portfolioName: portfolioNames[pid] ?? `Portfolio ${idx + 1}`,
        color: COLORS[idx % COLORS.length],
        returns,
      });
    }

    // Labels: first and last
    const labels = primarySnaps.map((s, i) => {
      if (i === 0 || i === primarySnaps.length - 1) {
        const d = new Date(s.timestamp);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return '';
    });

    return { series, labels };
  }, [snapsByPortfolio, portfolioIds, portfolioNames]);

  return { ...result, loading };
}

function findNearestBefore(
  snaps: PortfolioValueSnapshot[],
  targetMs: number,
): PortfolioValueSnapshot | null {
  if (snaps.length === 0) return null;
  let best: PortfolioValueSnapshot | null = null;
  for (const s of snaps) {
    const ms = new Date(s.timestamp).getTime();
    if (ms <= targetMs) best = s;
    else break; // sorted ascending
  }
  return best ?? snaps[0];
}
