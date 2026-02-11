import { useState, useEffect, useCallback } from 'react';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  getCustomerInfo,
  isProFromCustomerInfo,
  restorePurchases as restorePurchasesService,
  purchasePackage as purchasePackageService,
} from '../../services/revenuecat';

/**
 * Hook to check Pro entitlement and manage purchases.
 * Refreshes on mount and when refresh() is called.
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

  /**
   * Purchase a subscription package. Returns true on success, false if
   * cancelled or failed.
   */
  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setLoading(true);
    try {
      const info = await purchasePackageService(pkg);
      if (info) {
        const hasPro = isProFromCustomerInfo(info);
        setIsPro(hasPro);
        return hasPro;
      }
      return false; // user cancelled
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    setLoading(true);
    try {
      const info = await restorePurchasesService();
      const hasPro = isProFromCustomerInfo(info);
      setIsPro(hasPro);
      return hasPro;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { isPro, loading, refresh, purchase, restorePurchases };
}
