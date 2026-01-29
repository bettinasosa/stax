import { Platform } from 'react-native';
import Purchases, { type CustomerInfo } from 'react-native-purchases';

const ENTITLEMENT_PRO = 'pro';
const API_KEY_IOS = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '';
const API_KEY_ANDROID = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID ?? '';

let configured = false;

/**
 * Configure RevenueCat. Call once at app startup. Uses env API keys; if missing, Pro is always false.
 */
export function configureRevenueCat(): void {
  if (configured) return;
  const apiKey = Platform.OS === 'ios' ? API_KEY_IOS : API_KEY_ANDROID;
  if (apiKey) {
    try {
      Purchases.configure({ apiKey });
      configured = true;
    } catch {
      configured = true;
    }
  } else {
    configured = true;
  }
}

/**
 * Check if the user has the Pro entitlement.
 */
export function isProFromCustomerInfo(customerInfo: CustomerInfo | null): boolean {
  if (!customerInfo?.entitlements) return false;
  const ent = customerInfo.entitlements as Record<string, { isActive?: boolean }>;
  return Boolean(ent[ENTITLEMENT_PRO]?.isActive);
}

/**
 * Get current customer info (entitlements).
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!API_KEY_IOS && !API_KEY_ANDROID) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Restore previous purchases.
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!API_KEY_IOS && !API_KEY_ANDROID) return null;
  try {
    return await Purchases.restorePurchases();
  } catch {
    return null;
  }
}

/**
 * Check if RevenueCat is configured (has API key).
 */
export function isRevenueCatConfigured(): boolean {
  return Boolean(API_KEY_IOS || API_KEY_ANDROID);
}
