import { useState, useEffect } from 'react';
import { getEarnings, type FinnhubEarning, isFinnhubConfigured } from '../../../services/finnhub';

/**
 * Fetches earnings (EPS) data for a given stock symbol.
 */
export function useEarningsData(symbol: string | null) {
  const [earnings, setEarnings] = useState<FinnhubEarning[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol || !isFinnhubConfigured()) {
      setEarnings([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getEarnings(symbol, 20).then((data) => {
      if (cancelled) return;
      setEarnings(data);
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : 'Failed to load earnings');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { earnings, loading, error };
}
