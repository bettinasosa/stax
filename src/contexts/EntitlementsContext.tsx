import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  getCustomerInfo,
  isProFromCustomerInfo,
  restorePurchases as restorePurchasesService,
  purchasePackage as purchasePackageService,
} from '../services/revenuecat';

type EntitlementsContextValue = {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

/**
 * Single source of truth for Pro entitlement. Use this so that after purchase/restore
 * on PaywallScreen, all screens (Charts, Analysis, Overview, etc.) see the updated
 * isPro without needing their own refresh on focus.
 */
export function useEntitlementsContext(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) throw new Error('useEntitlementsContext must be used within EntitlementsProvider');
  return ctx;
}

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
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

  /* Re-fetch when app comes to foreground so we pick up restore/purchase on another device. */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setLoading(true);
    try {
      const info = await purchasePackageService(pkg);
      if (info) {
        const hasPro = isProFromCustomerInfo(info);
        setIsPro(hasPro);
        return hasPro;
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
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

  const value: EntitlementsContextValue = {
    isPro,
    loading,
    refresh,
    purchase,
    restorePurchases,
  };

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  );
}
