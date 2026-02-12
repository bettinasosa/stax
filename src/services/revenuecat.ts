import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

const ENTITLEMENT_PRO = 'Stax Pro';
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
  if (!customerInfo?.entitlements?.active) return false;
  return customerInfo.entitlements.active[ENTITLEMENT_PRO] != null;
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
 * Fetch available subscription offerings (packages with pricing).
 */
export async function getOfferings(): Promise<PurchasesOfferings | null> {
  if (!API_KEY_IOS && !API_KEY_ANDROID) return null;
  try {
    return await Purchases.getOfferings();
  } catch {
    return null;
  }
}

/**
 * Purchase a subscription package. Returns fresh CustomerInfo on success, null if
 * the user cancelled, or throws on unexpected errors.
 *
 * We re-fetch CustomerInfo after purchase because the object returned by
 * purchasePackage can be stale and may not yet reflect the new entitlement.
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo | null> {
  try {
    await Purchases.purchasePackage(pkg);
    // Re-fetch to guarantee entitlements are up to date
    return await Purchases.getCustomerInfo();
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean };
    if (err.userCancelled) return null;
    throw e;
  }
}

/**
 * Check if RevenueCat is configured (has API key).
 */
export function isRevenueCatConfigured(): boolean {
  return Boolean(API_KEY_IOS || API_KEY_ANDROID);
}
