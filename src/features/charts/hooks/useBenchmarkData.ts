import { useState, useEffect, useMemo } from 'react';
import { getStockCandle, isFinnhubConfigured } from '../../../services/finnhub';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';

const TIME_WINDOW_DAYS: Record<TimeWindow, number> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  'ALL': 365,
};

export interface BenchmarkPoint {
  timestamp: number; // UNIX seconds
  returnPct: number; // % return from start
}

/**
 * Fetches SPY candle data and normalizes to % returns for benchmark comparison.
 * Also normalizes the portfolio value history to % returns on the same timestamps.
 */
export function useBenchmarkData(
  timeWindow: TimeWindow,
  enabled: boolean,
  valueHistory: Array<{ timestamp: string; valueBase: number }>
) {
  const [spyCandle, setSpyCandle] = useState<{ c: number[]; t: number[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !isFinnhubConfigured()) {
      setSpyCandle(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const days = TIME_WINDOW_DAYS[timeWindow];
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400;

    getStockCandle('SPY', 'D', from, to).then((data) => {
      if (cancelled) return;
      if (data) {
        setSpyCandle({ c: data.c, t: data.t });
      } else {
        setSpyCandle(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [timeWindow, enabled]);

  const result = useMemo(() => {
    if (!enabled || !spyCandle || valueHistory.length < 2) {
      return { portfolioReturns: null, spyReturns: null, labels: null };
    }

    // Filter value history by time window
    const days = TIME_WINDOW_DAYS[timeWindow];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();
    const raw = valueHistory.filter((v) => v.timestamp >= sinceISO);

    // Deduplicate to one snapshot per calendar day (keep the last entry per day)
    const dailyMap = new Map<string, number>();
    for (const { timestamp, valueBase } of raw) {
      dailyMap.set(timestamp.slice(0, 10), valueBase);
    }
    const filtered = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, valueBase]) => ({ timestamp: day + 'T00:00:00.000Z', valueBase }));

    if (filtered.length < 2) {
      return { portfolioReturns: null, spyReturns: null, labels: null };
    }

    // Normalize portfolio to % returns
    const startVal = filtered[0].valueBase;
    if (startVal === 0) {
      return { portfolioReturns: null, spyReturns: null, labels: null };
    }
    const portfolioReturns = filtered.map(
      (v) => ((v.valueBase - startVal) / startVal) * 100
    );

    // For each portfolio timestamp, find nearest SPY close
    const spyReturns: number[] = [];
    const startSpyClose = findNearestClose(
      spyCandle.t,
      spyCandle.c,
      Math.floor(new Date(filtered[0].timestamp).getTime() / 1000)
    );
    if (startSpyClose === null) {
      return { portfolioReturns, spyReturns: null, labels: null };
    }

    for (const point of filtered) {
      const ts = Math.floor(new Date(point.timestamp).getTime() / 1000);
      const close = findNearestClose(spyCandle.t, spyCandle.c, ts);
      if (close !== null) {
        spyReturns.push(((close - startSpyClose) / startSpyClose) * 100);
      } else {
        spyReturns.push(spyReturns.length > 0 ? spyReturns[spyReturns.length - 1] : 0);
      }
    }

    // Build labels (first and last only)
    const labels = filtered.map((v, i) => {
      if (i === 0 || i === filtered.length - 1) {
        const d = new Date(v.timestamp);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return '';
    });

    return { portfolioReturns, spyReturns, labels };
  }, [enabled, spyCandle, valueHistory, timeWindow]);

  return { ...result, loading };
}

/** Binary search for nearest SPY close price at or before the given timestamp. */
function findNearestClose(
  timestamps: number[],
  closes: number[],
  targetTs: number
): number | null {
  if (timestamps.length === 0) return null;

  let lo = 0;
  let hi = timestamps.length - 1;

  if (targetTs < timestamps[0]) return closes[0];
  if (targetTs >= timestamps[hi]) return closes[hi];

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (timestamps[mid] === targetTs) return closes[mid];
    if (timestamps[mid] < targetTs) lo = mid + 1;
    else hi = mid - 1;
  }
  // hi is the largest index with timestamps[hi] <= targetTs
  return hi >= 0 ? closes[hi] : closes[0];
}
