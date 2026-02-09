import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
// NOTE: Paywall temporarily disabled during development.
// import { useEntitlements } from './useEntitlements';
// import { PaywallScreen } from './PaywallScreen';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingsWithValues, allocationByAssetClass } from '../portfolio/portfolioUtils';
import {
  computeConcentration,
  computeStaxScore,
  exposureBreakdown,
  computePerformance,
  generateRichInsights,
} from './analysisUtils';
import { StaxScoreRing } from './StaxScoreRing';
import { AllocationDonut } from './AllocationDonut';
import { PerformanceCard } from './PerformanceCard';
import { ConcentrationBars } from './ConcentrationBars';
import { theme } from '../../utils/theme';

const SEVERITY_COLORS: Record<string, string> = {
  info: theme.colors.accent,
  warning: '#F59E0B',
  critical: theme.colors.negative,
};

/**
 * Insights tab: Stax Score ring, actionable insights, allocation donut charts,
 * performance analysis, and concentration visualisation.
 */
export function AnalysisScreen() {
  const { portfolio, holdings, pricesBySymbol, loading, refresh } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';

  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency),
    [holdings, pricesBySymbol, baseCurrency]
  );
  const concentration = useMemo(() => computeConcentration(withValues), [withValues]);
  const score = useMemo(
    () => computeStaxScore(concentration, withValues),
    [concentration, withValues]
  );
  const exposure = useMemo(() => exposureBreakdown(withValues), [withValues]);
  const allocation = useMemo(() => allocationByAssetClass(withValues), [withValues]);
  const largestAssetClassPercent = useMemo(() => {
    if (allocation.length === 0) return 0;
    return Math.max(...allocation.map((a) => a.percent));
  }, [allocation]);
  const performance = useMemo(
    () => computePerformance(withValues, pricesBySymbol, baseCurrency),
    [withValues, pricesBySymbol, baseCurrency]
  );
  const richInsights = useMemo(
    () => generateRichInsights(concentration, score, withValues, performance),
    [concentration, score, withValues, performance]
  );

  if (holdings.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textPrimary} />
        }
      >
        <Text style={styles.emptyTitle}>No holdings yet</Text>
        <Text style={styles.emptySubtitle}>
          Add holdings to see your portfolio insights and diversification analysis.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textPrimary} />
      }
    >
      {/* ── Stax Score ── */}
      <View style={styles.card}>
        <Text style={styles.scoreLabel}>Stax Score</Text>
        <StaxScoreRing score={score} />
      </View>

      {/* ── Quick Insights ── */}
      {richInsights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Insights</Text>
          {richInsights.map((insight, i) => (
            <View key={i} style={styles.insightCard}>
              <View style={styles.insightHeader}>
                <View
                  style={[
                    styles.severityDot,
                    { backgroundColor: SEVERITY_COLORS[insight.severity] ?? theme.colors.accent },
                  ]}
                />
                <Text style={styles.insightTitle}>{insight.title}</Text>
              </View>
              <Text style={styles.insightBody}>{insight.body}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Allocation ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Allocation</Text>
        <AllocationDonut exposure={exposure} />
      </View>

      {/* ── Performance ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <PerformanceCard performance={performance} baseCurrency={baseCurrency} />
      </View>

      {/* ── Concentration ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Concentration</Text>
        <ConcentrationBars
          concentration={concentration}
          largestAssetClassPercent={largestAssetClassPercent}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  emptyTitle: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptySubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
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
    marginBottom: theme.spacing.sm,
  },
  section: { marginBottom: theme.spacing.md },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  insightCard: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  insightTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  insightBody: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    paddingLeft: 16,
  },
});
