import { useState, useEffect } from 'react';
import { getBasicFinancials, type FinnhubMetricResponse, isFinnhubConfigured } from '../../../services/finnhub';

/**
 * Fetches basic financial metrics for a given stock symbol.
 */
export function useFinancialMetrics(symbol: string | null) {
  const [metrics, setMetrics] = useState<FinnhubMetricResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol || !isFinnhubConfigured()) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getBasicFinancials(symbol).then((data) => {
      if (cancelled) return;
      setMetrics(data);
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e instanceof Error ? e.message : 'Failed to load metrics');
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return { metrics, loading, error };
}
