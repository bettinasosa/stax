import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { getOfferings, isRevenueCatConfigured } from '../../services/revenuecat';
import { useEntitlements } from './useEntitlements';
import { theme } from '../../utils/theme';
import { trackPaywallViewed, trackPurchaseCompleted, trackTrialStarted } from '../../services/analytics';

interface PaywallScreenProps {
  trigger?: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
}

const FEATURES = [
  'Unlimited holdings',
  'Analyst sentiment & price targets',
  'Insider buying/selling signals',
  'Deep allocation analysis (country, sector, currency)',
  'Concentration warnings and Stax Score',
  'Real estate & fixed income analytics',
  'Unlimited reminder schedules',
  'Time-weighted return (TWRR) & Sharpe ratio',
  'Compare against S&P 500, NASDAQ, Bonds & Gold',
  'Dividend yield analytics & income calendar',
  'PDF portfolio report',
  'Net worth tracking with liabilities',
  'Side-by-side portfolio comparison',
  'Cloud backup & restore',
];

/**
 * Paywall with subscription packages, dynamic pricing, restore, and dismiss.
 * Shown when the user hits a Pro-gated feature or free limit.
 */
export function PaywallScreen({ trigger, onDismiss, onSuccess }: PaywallScreenProps) {
  const { isPro, loading, refresh, purchase, restorePurchases } = useEntitlements();
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [firedSuccessForPro, setFiredSuccessForPro] = useState(false);

  /* Re-fetch entitlements when Paywall opens so we don't show paywall with stale data (e.g. after restore elsewhere). */
  useEffect(() => {
    refresh();
  }, [refresh]);

  /* Fetch available packages from RevenueCat on mount */
  useEffect(() => {
    let mounted = true;
    trackPaywallViewed(trigger ?? 'unknown');
    getOfferings().then((offerings) => {
      if (!mounted) return;
      const available = offerings?.current?.availablePackages ?? [];
      setPackages(available);
      // Pre-select annual if available, otherwise first package
      const annual = available.find((p) => p.packageType === 'ANNUAL');
      setSelectedPkg(annual ?? available[0] ?? null);
      setLoadingOfferings(false);
    });
    return () => { mounted = false; };
  }, [trigger]);

  /* If already Pro, fire success via effect (to avoid setState during render) */
  useEffect(() => {
    if (isPro && !firedSuccessForPro) {
      setFiredSuccessForPro(true);
      if (onSuccess) onSuccess();
    }
  }, [isPro, firedSuccessForPro, onSuccess]);

  if (isPro) {
    return null;
  }

  /* Loading state */
  if (loading || loadingOfferings) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    try {
      const ok = await purchase(selectedPkg);
      if (ok) {
        const hasFreeTrial = selectedPkg.product?.introPrice != null;
        if (hasFreeTrial) {
          trackTrialStarted();
        } else {
          trackPurchaseCompleted();
        }
        if (onSuccess) onSuccess();
      } else {
        Alert.alert(
          'Purchase not activated',
          'The transaction did not activate Stax Pro yet. If you are testing in Expo Go (Browser Mode), use a development build or TestFlight to validate in-app purchases reliably.'
        );
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        if (onSuccess) onSuccess();
      } else {
        Alert.alert('Restore', 'No previous purchase found.');
      }
    } catch {
      Alert.alert('Error', 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  const busy = purchasing || restoring;

  const hasTrial = selectedPkg?.product?.introPrice != null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>Stax Pro</Text>
      <Text style={styles.subtitle}>Unlock full portfolio insights</Text>
      <Text style={styles.outcomeLine}>
        Compare to S&P 500, see your Stax Score, and get allocation insights.
      </Text>

      {/* Feature bullets */}
      <View style={styles.features}>
        {FEATURES.map((f) => (
          <View key={f} style={styles.featureRow}>
            <Text style={styles.checkmark}>{'✓'}</Text>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Trigger hint — benefit-first when trigger is provided */}
      {trigger ? (
        <Text style={styles.trigger}>{trigger}</Text>
      ) : null}

      {/* Package selector */}
      {packages.length > 0 ? (
        <View style={styles.packages}>
          {packages.map((pkg) => {
            const selected = pkg.identifier === selectedPkg?.identifier;
            const trialLabel = getTrialLabel(pkg);
            return (
              <TouchableOpacity
                key={pkg.identifier}
                style={[styles.packageCard, selected && styles.packageCardSelected]}
                onPress={() => setSelectedPkg(pkg)}
                activeOpacity={0.7}
              >
                {trialLabel ? (
                  <Text style={[styles.packageTrialBadge, selected && styles.packageTrialBadgeSelected]}>
                    {trialLabel}
                  </Text>
                ) : null}
                <Text style={[styles.packageTitle, selected && styles.packageTitleSelected]}>
                  {packageLabel(pkg)}
                </Text>
                <Text style={[styles.packagePrice, selected && styles.packagePriceSelected]}>
                  {pkg.product.priceString}
                  {periodSuffix(pkg)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.noPackages}>
          <Text style={styles.noPackagesText}>
            {isRevenueCatConfigured()
              ? 'No subscription plans available right now. Please try again later.'
              : 'Subscription pricing unavailable in this build.'}
          </Text>
        </View>
      )}

      {/* Subscribe CTA — show trial when available */}
      <TouchableOpacity
        style={[styles.subscribeBtn, busy && styles.buttonDisabled]}
        onPress={handlePurchase}
        disabled={busy || !selectedPkg}
        activeOpacity={0.8}
      >
        {purchasing ? (
          <ActivityIndicator color={theme.colors.background} size="small" />
        ) : (
          <Text style={styles.subscribeBtnText}>
            {selectedPkg
              ? hasTrial
                ? `Start ${getTrialLabel(selectedPkg) ?? 'free trial'}`
                : `Subscribe ${selectedPkg.product.priceString}${periodSuffix(selectedPkg)}`
              : 'Subscribe'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Restore purchases */}
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={handleRestore}
        disabled={busy}
      >
        {restoring ? (
          <ActivityIndicator color={theme.colors.textSecondary} size="small" />
        ) : (
          <Text style={styles.secondaryBtnText}>Restore purchases</Text>
        )}
      </TouchableOpacity>

      {/* Dismiss */}
      {onDismiss && (
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} disabled={busy}>
          <Text style={styles.dismissText}>Maybe later</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

/* ---------- helpers ---------- */

/**
 * Returns a short trial label when the package has an intro offer (e.g. "7-day free trial").
 * Used on package cards and the main CTA.
 */
function getTrialLabel(pkg: PurchasesPackage): string | null {
  const intro = pkg.product?.introPrice;
  if (!intro) return null;
  // Optional: use period from StoreKit if available (e.g. periodNumberOfUnits + periodUnit)
  const raw = intro as { periodNumberOfUnits?: number; periodUnit?: string } | undefined;
  if (raw?.periodNumberOfUnits != null && raw?.periodUnit != null) {
    const unit = raw.periodUnit === 'DAY' ? 'day' : raw.periodUnit === 'WEEK' ? 'week' : raw.periodUnit === 'MONTH' ? 'month' : 'day';
    const n = raw.periodNumberOfUnits;
    return `${n}-${unit} free trial`;
  }
  return 'Free trial';
}

/** Human-friendly label for a package type. */
function packageLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL': return 'Annual';
    case 'MONTHLY': return 'Monthly';
    case 'SIX_MONTH': return '6 Months';
    case 'THREE_MONTH': return '3 Months';
    case 'TWO_MONTH': return '2 Months';
    case 'WEEKLY': return 'Weekly';
    case 'LIFETIME': return 'Lifetime';
    default: return pkg.identifier;
  }
}

/** Short period suffix for display next to price. */
function periodSuffix(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case 'ANNUAL': return '/yr';
    case 'MONTHLY': return '/mo';
    case 'SIX_MONTH': return '/6mo';
    case 'THREE_MONTH': return '/3mo';
    case 'TWO_MONTH': return '/2mo';
    case 'WEEKLY': return '/wk';
    case 'LIFETIME': return '';
    default: return '';
  }
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingTop: theme.spacing.xxl,
    paddingBottom: theme.spacing.xxl,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  title: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  outcomeLine: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.lg,
  },
  /* Features */
  features: { marginBottom: theme.spacing.lg },
  featureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkmark: {
    color: theme.colors.positive,
    fontSize: 16,
    fontWeight: '700',
    marginRight: 10,
    width: 20,
    textAlign: 'center',
  },
  featureText: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  trigger: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.lg,
  },
  /* Package selector */
  packages: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: theme.spacing.lg,
  },
  packageCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  packageCardSelected: {
    borderColor: theme.colors.white,
    backgroundColor: theme.colors.surface,
  },
  packageTrialBadge: {
    ...theme.typography.small,
    color: theme.colors.positive,
    marginBottom: 4,
  },
  packageTrialBadgeSelected: {
    color: theme.colors.positive,
  },
  packageTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  packageTitleSelected: { color: theme.colors.textPrimary },
  packagePrice: {
    ...theme.typography.bodySemi,
    color: theme.colors.textSecondary,
  },
  packagePriceSelected: { color: theme.colors.textPrimary },
  /* Buttons */
  subscribeBtn: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  subscribeBtnText: {
    color: theme.colors.background,
    ...theme.typography.bodySemi,
  },
  buttonDisabled: { opacity: 0.6 },
  secondaryBtn: {
    alignItems: 'center',
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  secondaryBtnText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  dismissBtn: { alignItems: 'center', padding: theme.spacing.xs },
  dismissText: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
  },
  noPackages: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    marginBottom: theme.spacing.lg,
  },
  noPackagesText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center' as const,
  },
});
