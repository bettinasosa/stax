import { useState, useEffect, useMemo } from 'react';
import { getYahooCandle } from '../../../services/yahooFinance';
import { getStockCandle, isFinnhubConfigured } from '../../../services/finnhub';
import type { CandleData } from '../CandlestickChart';

// ---------------------------------------------------------------------------
// Alpha Vantage daily candle helper (25 free requests/day, cached 4 hrs)
// ---------------------------------------------------------------------------

interface AVCandle {
  c: number[]; h: number[]; l: number[]; o: number[]; t: number[]; v: number[];
}
const _avCache = new Map<string, { data: AVCandle; expiresAt: number }>();

async function getAlphaVantageCandle(symbol: string): Promise<AVCandle | null> {
  const apiKey = process.env.EXPO_PUBLIC_ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `av_candle_${symbol}`;
  const cached = _avCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  try {
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[AlphaVantage] Candle ${symbol}: HTTP ${res.status}`);
      return null;
    }
    type AVDailyRow = { '1. open': string; '2. high': string; '3. low': string; '4. close': string; '5. volume': string };
    const data = await res.json() as { 'Time Series (Daily)'?: Record<string, AVDailyRow>; Note?: string; Information?: string };
    if (data.Note || data.Information) {
      console.warn(`[AlphaVantage] Candle ${symbol}: rate limited`);
      return null;
    }
    const series = data['Time Series (Daily)'];
    if (!series) return null;

    const entries = Object.entries(series).sort((a, b) => a[0].localeCompare(b[0]));
    const opens: number[] = [], highs: number[] = [], lows: number[] = [];
    const closes: number[] = [], volumes: number[] = [], timestamps: number[] = [];

    for (const [date, row] of entries) {
      opens.push(parseFloat(row['1. open']));
      highs.push(parseFloat(row['2. high']));
      lows.push(parseFloat(row['3. low']));
      closes.push(parseFloat(row['4. close']));
      volumes.push(parseInt(row['5. volume'], 10));
      timestamps.push(Math.floor(new Date(date + 'T12:00:00Z').getTime() / 1000));
    }
    if (closes.length === 0) return null;

    console.log(`[AlphaVantage] Candle ${symbol}: ${closes.length} data points`);
    const candle = { c: closes, h: highs, l: lows, o: opens, t: timestamps, v: volumes };
    _avCache.set(cacheKey, { data: candle, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
    return candle;
  } catch (err) {
    console.warn(`[AlphaVantage] Candle ${symbol}:`, err);
    return null;
  }
}

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';

const TIME_WINDOW_DAYS: Record<TimeWindow, number> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  'ALL': 365,
};

export interface BenchmarkSeries {
  symbol: string;
  label: string;
  color: string;
  returns: number[];
}

interface RawCandle {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  t: number[];
  v: number[];
}

/**
 * Fetch candle data for a single symbol.
 * Tries Finnhub first (configured API key, reliable), falls back to Yahoo Finance.
 */
async function fetchCandleWithFallback(
  sym: string,
  timeWindow: TimeWindow,
  from: number,
  to: number,
): Promise<RawCandle | null> {
  // 1. Try Finnhub (configured API key — supports US ETFs on free tier)
  if (isFinnhubConfigured()) {
    try {
      const finnhub = await getStockCandle(sym, 'D', from, to);
      if (finnhub && finnhub.s === 'ok' && finnhub.c.length > 0) {
        return { c: finnhub.c, h: finnhub.h, l: finnhub.l, o: finnhub.o, t: finnhub.t, v: finnhub.v };
      }
    } catch (err) {
      console.warn(`[Benchmark] Finnhub failed for ${sym}:`, err);
    }
  }

  // 2. Try Alpha Vantage (free tier, 25 req/day, cached 4 hrs)
  const av = await getAlphaVantageCandle(sym);
  if (av && av.c.length > 0) return av;

  // 3. Fallback to Yahoo Finance (no API key needed)
  try {
    const yahoo = await getYahooCandle(sym, timeWindow);
    if (yahoo && yahoo.s === 'ok' && yahoo.c.length > 0) {
      return { c: yahoo.c, h: yahoo.h, l: yahoo.l, o: yahoo.o, t: yahoo.t, v: yahoo.v };
    }
  } catch (err) {
    console.warn(`[Benchmark] Yahoo Finance failed for ${sym}:`, err);
  }

  return null;
}

/**
 * Fetches candle data for multiple benchmark symbols in parallel,
 * normalizes each to % returns, and aligns them to the portfolio's timestamps.
 * Also exposes raw OHLCV candle data for the candlestick chart view.
 *
 * Data source priority: Yahoo Finance (free) → Finnhub (free tier limited).
 */
export function useMultiBenchmarkData(
  timeWindow: TimeWindow,
  symbols: string[],
  valueHistory: Array<{ timestamp: string; valueBase: number }>,
  benchmarkConfig: Array<{ symbol: string; label: string; color: string }>,
) {
  const [candlesBySymbol, setCandlesBySymbol] = useState<Map<string, RawCandle>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch candle data for all requested symbols
  useEffect(() => {
    if (symbols.length === 0) {
      setCandlesBySymbol(new Map());
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const days = TIME_WINDOW_DAYS[timeWindow];
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400;

    Promise.all(
      symbols.map((sym) =>
        fetchCandleWithFallback(sym, timeWindow, from, to)
          .then((data) => ({ sym, data }))
          .catch((err) => {
            console.warn(`[Benchmark] Failed to fetch candle for ${sym}:`, err);
            return { sym, data: null };
          }),
      ),
    )
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, RawCandle>();
        const failedSymbols: string[] = [];
        for (const { sym, data } of results) {
          if (data && data.c.length > 0) {
            map.set(sym, data);
          } else {
            failedSymbols.push(sym);
          }
        }
        setCandlesBySymbol(map);
        setLoading(false);
        if (failedSymbols.length > 0 && map.size === 0) {
          console.warn('[Benchmark] All candle fetches failed:', failedSymbols);
          setError(
            `No candle data for ${failedSymbols.join(', ')}. Yahoo Finance and Finnhub both unavailable.`,
          );
        } else if (failedSymbols.length > 0) {
          console.warn('[Benchmark] Some candle fetches failed:', failedSymbols);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[Benchmark] Network error:', err);
          setLoading(false);
          setError('Network error loading benchmark data.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [timeWindow, symbols.join(',')]);

  // Compute % returns for benchmark comparison lines
  const result = useMemo(() => {
    if (valueHistory.length < 2) {
      return { portfolioReturns: null, benchmarks: [], labels: null };
    }

    // Filter value history by time window
    const days = TIME_WINDOW_DAYS[timeWindow];
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();
    const raw = valueHistory.filter((v) => v.timestamp >= sinceISO);

    // Deduplicate to one snapshot per calendar day (keep the last entry per day)
    // This prevents intraday multi-snapshot inflation of % returns
    const dailyMap = new Map<string, number>();
    for (const { timestamp, valueBase } of raw) {
      dailyMap.set(timestamp.slice(0, 10), valueBase);
    }
    const filtered = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, valueBase]) => ({ timestamp: day + 'T00:00:00.000Z', valueBase }));

    if (filtered.length < 2) {
      return { portfolioReturns: null, benchmarks: [], labels: null };
    }

    // Normalize portfolio to % returns
    const startVal = filtered[0].valueBase;
    if (startVal === 0) {
      return { portfolioReturns: null, benchmarks: [], labels: null };
    }
    const portfolioReturns = filtered.map(
      (v) => ((v.valueBase - startVal) / startVal) * 100,
    );

    // Build benchmark series
    const benchmarks: BenchmarkSeries[] = [];
    for (const cfg of benchmarkConfig) {
      const candle = candlesBySymbol.get(cfg.symbol);
      if (!candle || candle.c.length === 0) continue;

      const startClose = findNearestClose(
        candle.t,
        candle.c,
        Math.floor(new Date(filtered[0].timestamp).getTime() / 1000),
      );
      if (startClose === null || startClose === 0) continue;

      const returns: number[] = [];
      for (const point of filtered) {
        const ts = Math.floor(new Date(point.timestamp).getTime() / 1000);
        const close = findNearestClose(candle.t, candle.c, ts);
        if (close !== null) {
          returns.push(((close - startClose) / startClose) * 100);
        } else {
          returns.push(returns.length > 0 ? returns[returns.length - 1] : 0);
        }
      }

      benchmarks.push({
        symbol: cfg.symbol,
        label: cfg.label,
        color: cfg.color,
        returns,
      });
    }

    // Build labels (first and last only)
    const labels = filtered.map((v, i) => {
      if (i === 0 || i === filtered.length - 1) {
        const d = new Date(v.timestamp);
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      }
      return '';
    });

    return { portfolioReturns, benchmarks, labels };
  }, [candlesBySymbol, valueHistory, timeWindow, benchmarkConfig]);

  // Expose raw OHLCV candle data for the candlestick view
  const candlestickData = useMemo((): Map<string, CandleData[]> => {
    const map = new Map<string, CandleData[]>();
    for (const [sym, raw] of candlesBySymbol) {
      const candles: CandleData[] = [];
      for (let i = 0; i < raw.t.length; i++) {
        candles.push({
          o: raw.o[i],
          h: raw.h[i],
          l: raw.l[i],
          c: raw.c[i],
          t: raw.t[i],
        });
      }
      map.set(sym, candles);
    }
    return map;
  }, [candlesBySymbol]);

  return { ...result, loading, error, candlestickData };
}

/** Binary search for nearest close price at or before the given timestamp. */
function findNearestClose(
  timestamps: number[],
  closes: number[],
  targetTs: number,
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
  return hi >= 0 ? closes[hi] : closes[0];
}
