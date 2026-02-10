import { useCallback, useEffect, useState } from 'react';
import {
  getEarningsCalendar,
  isFinnhubConfigured,
  type EarningsCalendarEntry,
} from '../../../services/finnhub';
import type { Holding } from '../../../data/schemas';

export interface EarningsEvent {
  /** Synthetic id for list keys. */
  id: string;
  symbol: string;
  date: string;
  hour: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  /** Resolved holding name (if the symbol matches a portfolio holding). */
  holdingName: string;
  holdingId: string | null;
}

/**
 * Fetch upcoming earnings dates from Finnhub for all stock/ETF holdings.
 * Looks 90 days ahead from today. Returns events sorted by date ascending.
 */
export function useEarningsCalendar(holdings: Holding[]) {
  const [events, setEvents] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isFinnhubConfigured()) return;

    const stockEtfHoldings = holdings.filter(
      (h) => h.symbol && (h.type === 'stock' || h.type === 'etf')
    );
    if (stockEtfHoldings.length === 0) {
      setEvents([]);
      return;
    }

    setLoading(true);

    const today = new Date();
    const from = today.toISOString().slice(0, 10);
    const end = new Date(today);
    end.setDate(end.getDate() + 90);
    const to = end.toISOString().slice(0, 10);

    // Build lookup: symbol -> holding
    const symbolMap = new Map<string, Holding>();
    for (const h of stockEtfHoldings) {
      if (h.symbol) symbolMap.set(h.symbol.toUpperCase(), h);
    }

    // Fetch earnings for each symbol (batch into single requests per symbol to
    // stay within free-tier limits). We cap at 20 symbols to avoid excessive calls.
    const symbols = Array.from(symbolMap.keys()).slice(0, 20);

    const allEntries: EarningsCalendarEntry[] = [];
    // Fetch in small batches of 5 to avoid rate limiting
    for (let i = 0; i < symbols.length; i += 5) {
      const batch = symbols.slice(i, i + 5);
      const results = await Promise.all(
        batch.map((sym) => getEarningsCalendar(from, to, sym))
      );
      for (const entries of results) {
        allEntries.push(...entries);
      }
    }

    // Deduplicate by symbol+date
    const seen = new Set<string>();
    const deduped: EarningsCalendarEntry[] = [];
    for (const entry of allEntries) {
      const key = `${entry.symbol}_${entry.date}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(entry);
      }
    }

    const mapped: EarningsEvent[] = deduped
      .filter((e) => symbolMap.has(e.symbol.toUpperCase()))
      .map((e) => {
        const holding = symbolMap.get(e.symbol.toUpperCase());
        return {
          id: `earnings_${e.symbol}_${e.date}`,
          symbol: e.symbol,
          date: e.date,
          hour: e.hour,
          epsEstimate: e.epsEstimate,
          revenueEstimate: e.revenueEstimate,
          holdingName: holding?.name ?? e.symbol,
          holdingId: holding?.id ?? null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    setEvents(mapped);
    setLoading(false);
  }, [holdings]);

  useEffect(() => {
    load();
  }, [load]);

  return { earningsEvents: events, earningsLoading: loading, refreshEarnings: load };
}
