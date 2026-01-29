import { useState, useEffect, useCallback } from 'react';
import {
  getCustomerInfo,
  isProFromCustomerInfo,
  restorePurchases as restorePurchasesService,
} from '../../services/revenuecat';

/**
 * Hook to check Pro entitlement. Refreshes on mount and when refresh() is called.
 */
export function useEntitlements() {
  const [isPro, setIsPro] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const info = await getCustomerInfo();
      setIsPro(isProFromCustomerInfo(info));
    } catch {
      setIsPro(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const restorePurchases = useCallback(async () => {
    setLoading(true);
    try {
      const info = await restorePurchasesService();
      setIsPro(isProFromCustomerInfo(info));
      return info != null;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { isPro, loading, refresh, restorePurchases };
}
