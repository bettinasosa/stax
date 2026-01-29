import React, { useMemo, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useEntitlements } from './useEntitlements';
import { PaywallScreen } from './PaywallScreen';
import { trackPaywallViewed, trackAnalysisViewed } from '../../services/analytics';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingsWithValues, allocationByAssetClass } from '../portfolio/portfolioUtils';
import {
  computeConcentration,
  computeStaxScore,
  generateInsights,
  exposureBreakdown,
} from './analysisUtils';
import { theme } from '../../utils/theme';

/**
 * Analysis tab: paywall if not Pro, else exposure, concentration, Stax Score, insights.
 */
export function AnalysisScreen() {
  const { isPro, loading } = useEntitlements();
  const { portfolio, holdings, pricesBySymbol } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency),
    [holdings, pricesBySymbol, baseCurrency]
  );
  const concentration = useMemo(
    () => computeConcentration(withValues),
    [withValues]
  );
  const score = useMemo(
    () => computeStaxScore(concentration, withValues),
    [concentration, withValues]
  );
  const insights = useMemo(
    () => generateInsights(concentration, score, withValues),
    [concentration, score, withValues]
  );
  const exposure = useMemo(() => exposureBreakdown(withValues), [withValues]);
  const allocation = useMemo(() => allocationByAssetClass(withValues), [withValues]);
  const largestAssetClassPercent = useMemo(() => {
    if (allocation.length === 0) return 0;
    return Math.max(...allocation.map((a) => a.percent));
  }, [allocation]);
  const insights3 = useMemo(() => insights.slice(0, 3), [insights]);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    if (isPro && holdings.length > 0) trackAnalysisViewed();
  }, [isPro, holdings.length]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  if (!isPro) {
    trackPaywallViewed('Open Insights tab');
    if (showPaywall) {
      return (
        <PaywallScreen
          trigger="Open Insights tab"
          onDismiss={undefined}
        />
      );
    }
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.previewCard}>
          <View style={styles.previewBlur}>
            <Text style={styles.previewScoreLabel}>Stax Score</Text>
            <Text style={styles.previewScoreValue}>••</Text>
            <Text style={styles.previewHint}>Top holding % • Top 3 % • Largest asset class %</Text>
            <Text style={styles.previewInsight}>High concentration in •••</Text>
            <Text style={styles.previewInsight}>Large exposure to •••</Text>
            <Text style={styles.previewInsight}>Add diversification •••</Text>
          </View>
          <Text style={styles.previewCta}>Unlock full insights with Stax Pro</Text>
          <TouchableOpacity
            style={styles.previewButton}
            onPress={() => setShowPaywall(true)}
          >
            <Text style={styles.previewButtonText}>Unlock Pro</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  if (holdings.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Add holdings to see analysis.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.scoreLabel}>Stax Score</Text>
        <Text style={styles.scoreValue}>{score}</Text>
        <Text style={styles.scoreHint}>0 = concentrated, 100 = well diversified</Text>
      </View>

      {insights3.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>
          {insights3.map((line, i) => (
            <View key={i} style={styles.insightRow}>
              <Text style={styles.insightText}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Concentration</Text>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Top holding %</Text>
          <Text style={styles.metricValue}>{concentration.topHoldingPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Top 3 %</Text>
          <Text style={styles.metricValue}>{concentration.top3CombinedPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.metricRow}>
          <Text style={styles.metricLabel}>Largest asset class %</Text>
          <Text style={styles.metricValue}>{largestAssetClassPercent.toFixed(1)}%</Text>
        </View>
      </View>

      {exposure.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exposure</Text>
          {exposure.slice(0, 12).map((s, i) => (
            <View key={i} style={styles.exposureRow}>
              <Text style={styles.exposureLabel}>{s.label}</Text>
              <Text style={styles.exposureValue}>{s.percent.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  empty: { ...theme.typography.body, color: theme.colors.textSecondary },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  scoreLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  scoreValue: {
    ...theme.typography.title,
    fontSize: 48,
    color: theme.colors.textPrimary,
  },
  scoreHint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  section: { marginBottom: theme.spacing.sm },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  insightRow: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  insightText: { ...theme.typography.caption, color: theme.colors.textPrimary },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  metricLabel: { ...theme.typography.caption, color: theme.colors.textSecondary },
  metricValue: { ...theme.typography.captionMedium, color: theme.colors.textPrimary },
  exposureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: 2,
  },
  exposureLabel: { ...theme.typography.caption, color: theme.colors.textSecondary },
  exposureValue: { ...theme.typography.captionMedium, color: theme.colors.textPrimary },
  previewCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    alignItems: 'center',
  },
  previewBlur: {
    opacity: 0.6,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  previewScoreLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  previewScoreValue: {
    ...theme.typography.title,
    fontSize: 48,
    color: theme.colors.textPrimary,
  },
  previewHint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  previewInsight: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  previewCta: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  previewButton: {
    backgroundColor: theme.colors.white,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.layout.cardRadius,
  },
  previewButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
});
