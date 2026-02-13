import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useEntitlements } from './useEntitlements';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingsWithValues, allocationByAssetClass } from '../portfolio/portfolioUtils';
import {
  computeConcentration,
  computeStaxScore,
  exposureBreakdown,
  computePerformance,
  generateRichInsights,
  computeTWRR,
  computeSharpe,
} from './analysisUtils';
import { StaxScoreRing } from './StaxScoreRing';
import { AllocationDonut } from './AllocationDonut';
import { PerformanceCard } from './PerformanceCard';
import { ConcentrationBars } from './ConcentrationBars';
import { MarketPulse } from './MarketPulse';
import { PerformanceMetricsCard } from './PerformanceMetricsCard';
import { BenchmarkComparisonCard } from './BenchmarkComparisonCard';
import { DividendAnalyticsCard } from './DividendAnalyticsCard';
import { useDividendAnalytics } from './hooks/useDividendAnalytics';
import { theme } from '../../utils/theme';

type InsightsTab = 'score' | 'market' | 'analysis' | 'dividends';

const TABS: { key: InsightsTab; label: string }[] = [
  { key: 'score', label: 'Score & Insights' },
  { key: 'market', label: 'Market Pulse' },
  { key: 'analysis', label: 'Deep Analysis' },
  { key: 'dividends', label: 'Dividends' },
];

const SEVERITY_COLORS: Record<string, string> = {
  info: theme.colors.accent,
  warning: '#F59E0B',
  critical: theme.colors.negative,
};

/**
 * Insights tab: tabbed layout with Score & Insights, Market Pulse (analyst sentiment),
 * and Deep Analysis (allocation, performance, concentration).
 */
export function AnalysisScreen() {
  const navigation = useNavigation();
  const { isPro, refresh: refreshEntitlements } = useEntitlements();
  const { portfolio, holdings, pricesBySymbol, loading, refresh, fxRates, transactions, valueHistory, totalBase } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const [activeTab, setActiveTab] = useState<InsightsTab>('score');

  useFocusEffect(
    useCallback(() => {
      refresh();
      refreshEntitlements();
    }, [refresh, refreshEntitlements])
  );

  const handleTabPress = (tab: InsightsTab) => {
    // Market, analysis, and dividends tabs require Pro
    const requiresPro = tab === 'market' || tab === 'analysis' || tab === 'dividends';

    if (requiresPro && !isPro) {
      const triggers: Record<InsightsTab, string> = {
        market: 'Unlock Market Pulse — analyst sentiment & price targets',
        analysis: 'Unlock Deep Analysis — benchmarks, TWRR, allocation & more',
        dividends: 'Unlock Dividend Analytics — yield, income calendar & more',
        score: '',
      };
      (navigation as any).navigate('Paywall', { trigger: triggers[tab] });
      return;
    }

    setActiveTab(tab);
  };

  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency, fxRates),
    [holdings, pricesBySymbol, baseCurrency, fxRates]
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
    () => computePerformance(withValues, pricesBySymbol, baseCurrency, fxRates),
    [withValues, pricesBySymbol, baseCurrency, fxRates]
  );
  const richInsights = useMemo(
    () => generateRichInsights(concentration, score, withValues, performance),
    [concentration, score, withValues, performance]
  );
  const twrr = useMemo(() => computeTWRR(valueHistory, transactions), [valueHistory, transactions]);
  const sharpe = useMemo(() => computeSharpe(valueHistory), [valueHistory]);
  const dividendAnalytics = useDividendAnalytics(transactions, holdings);

  /** Include a live "today" point using the same totalBase as Overview so the chart matches the portfolio value shown elsewhere. */
  const valueHistoryForChart = useMemo(() => {
    if (valueHistory.length === 0) return valueHistory.map((v) => ({ timestamp: v.timestamp, valueBase: v.valueBase }));
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = valueHistory[valueHistory.length - 1].timestamp.slice(0, 10);
    if (lastDate >= today) {
      return valueHistory.map((v) => ({ timestamp: v.timestamp, valueBase: v.valueBase }));
    }
    return [
      ...valueHistory.map((v) => ({ timestamp: v.timestamp, valueBase: v.valueBase })),
      { timestamp: new Date().toISOString(), valueBase: totalBase },
    ];
  }, [valueHistory, totalBase]);

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
      {/* ── Sub-tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
      >
        <View style={styles.tabsRow}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => handleTabPress(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* ══════════════ Score & Insights ══════════════ */}
      {activeTab === 'score' && (
        <>
          {/* Stax Score */}
          <View style={styles.card}>
            <Text style={styles.scoreLabel}>Stax Score</Text>
            <StaxScoreRing score={score} />
            <Text style={styles.scoreHint}>
              {score >= 80
                ? 'Your portfolio is well diversified across holdings and asset classes.'
                : score >= 50
                  ? 'There\'s room to improve your diversification.'
                  : 'Your portfolio is heavily concentrated — consider rebalancing.'}
            </Text>
          </View>

          {/* Quick Insights */}
          {richInsights.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Key Insights</Text>
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

          {/* Concentration (compact) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Concentration</Text>
            <ConcentrationBars
              concentration={concentration}
              largestAssetClassPercent={largestAssetClassPercent}
            />
          </View>

          {/* Pro preview CTA — make it obvious this tab is a taste of Pro */}
          {!isPro && (
            <View style={styles.proPreviewBanner}>
              <Text style={styles.proPreviewTitle}>This is a preview of your insights</Text>
              <Text style={styles.proPreviewText}>
                Unlock Market Pulse, Deep Analysis, and Dividends with Stax Pro — benchmarks, allocation, and more.
              </Text>
              <TouchableOpacity
                style={styles.proPreviewCta}
                onPress={() => (navigation as any).navigate('Paywall', { trigger: 'Score & Insights preview' })}
                activeOpacity={0.8}
              >
                <Text style={styles.proPreviewCtaText}>Unlock with Stax Pro</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* ══════════════ Market Pulse ══════════════ */}
      {activeTab === 'market' && <MarketPulse holdings={holdings} />}

      {/* ══════════════ Deep Analysis ══════════════ */}
      {activeTab === 'analysis' && (
        <>
          {/* Benchmark comparison vs S&P 500 */}
          <BenchmarkComparisonCard valueHistory={valueHistoryForChart} />

          {/* Deep analysis explainer */}
          <View style={styles.section}>
            <Text style={styles.sectionSubtext}>
              Deep Analysis helps you understand what is driving your returns, how balanced your
              allocation is, and where concentration risk might be hiding.
            </Text>
          </View>

          {/* TWRR & Sharpe (Pro) */}
          <PerformanceMetricsCard twrr={twrr} sharpe={sharpe} />

          {/* Allocation Donuts */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Allocation Breakdown</Text>
            <Text style={styles.sectionSubtext}>
              See how your portfolio is split across asset classes and themes. A more balanced mix
              can reduce the impact of any single bucket on your overall returns.
            </Text>
            <AllocationDonut exposure={exposure} />
          </View>

          {/* Performance */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance</Text>
            <Text style={styles.sectionSubtext}>
              Spot which positions are driving gains and losses today, plus your unrealized P&amp;L
              across the portfolio.
            </Text>
            <PerformanceCard performance={performance} baseCurrency={baseCurrency} />
          </View>

          {/* Concentration (full) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Concentration Detail</Text>
            <Text style={styles.sectionSubtext}>
              Each bar shows how much of your portfolio sits in a single holding, group of holdings,
              or theme. The thin vertical line is a diversification guideline — when bars push past
              it (especially in amber or red), it signals areas where you may want to trim exposure.
            </Text>
            <ConcentrationBars
              concentration={concentration}
              largestAssetClassPercent={largestAssetClassPercent}
            />
          </View>
        </>
      )}

      {/* ══════════════ Dividends ══════════════ */}
      {activeTab === 'dividends' && (
        <DividendAnalyticsCard analytics={dividendAnalytics} baseCurrency={baseCurrency} />
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

  // Tabs
  tabsScroll: {
    marginBottom: theme.spacing.sm,
    flexGrow: 0,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  tab: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tabActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  tabText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  tabTextActive: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
  },

  // Cards
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
  scoreHint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
  },
  section: { marginBottom: theme.spacing.md },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sectionSubtext: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
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

  // Pro preview banner (Score & Insights tab)
  proPreviewBanner: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  proPreviewTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  proPreviewText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  proPreviewCta: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.textPrimary,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  proPreviewCtaText: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
  },
});
