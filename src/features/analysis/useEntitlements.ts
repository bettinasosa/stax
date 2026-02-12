import { useEntitlementsContext } from '../../contexts/EntitlementsContext';

/**
 * Hook to check Pro entitlement and manage purchases.
 * Uses shared EntitlementsContext so that after purchase/restore on the Paywall
 * screen, all screens see the updated isPro immediately (no stale state).
 */
export function useEntitlements() {
  return useEntitlementsContext();
}
