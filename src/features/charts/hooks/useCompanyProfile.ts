import { useCallback, useEffect, useState } from 'react';
import {
  getCompanyProfile,
  isFinnhubConfigured,
  type CompanyProfile,
} from '../../../services/finnhub';

/**
 * Fetch company profile from Finnhub for a single symbol.
 * Provides country, industry, exchange, logo, market cap, etc.
 */
export function useCompanyProfile(symbol: string | null) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isFinnhubConfigured() || !symbol) {
      setProfile(null);
      return;
    }
    setLoading(true);
    const data = await getCompanyProfile(symbol);
    setProfile(data);
    setLoading(false);
  }, [symbol]);

  useEffect(() => {
    load();
  }, [load]);

  return { profile, profileLoading: loading };
}
