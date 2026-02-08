import { useCallback, useEffect, useState } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { holdingRepo, eventRepo } from '../../data';
import type { Event, Holding } from '../../data/schemas';

export type AlertItem = { event: Event; holding: Holding };

/**
 * Hook to load upcoming events for a portfolio.
 * Returns upcoming events sorted by date with their associated holdings.
 */
export function useUpcomingAlerts(portfolioId: string | null) {
  const db = useSQLiteContext();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!portfolioId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const holdings = await holdingRepo.getByPortfolioId(db, portfolioId);
    const all: AlertItem[] = [];
    const now = new Date().toISOString();
    for (const holding of holdings) {
      const events = await eventRepo.getByHoldingId(db, holding.id);
      for (const event of events) {
        if (event.date >= now) {
          all.push({ event, holding });
        }
      }
    }
    all.sort((a, b) => a.event.date.localeCompare(b.event.date));
    setItems(all);
    setLoading(false);
  }, [db, portfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load();
  }, [load]);

  return { items, loading, refresh };
}
