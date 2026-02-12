import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { LineChart } from 'react-native-chart-kit';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingsWithValues, portfolioChange } from '../portfolio/portfolioUtils';
import { theme } from '../../utils/theme';
import { useMultiBenchmarkData } from './hooks/useMultiBenchmarkData';
import { useEntitlements } from '../analysis/useEntitlements';
import { EventsTimeline } from './EventsTimeline';
import { FundamentalsView } from './FundamentalsView';
import { IndicesAtAGlance } from './IndicesAtAGlance';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';
type ChartView = 'portfolio' | 'events' | 'fundamentals';

const TABS: { key: ChartView; label: string }[] = [
  { key: 'fundamentals', label: 'Fundamentals' },
  { key: 'events', label: 'Events' },
  { key: 'portfolio', label: 'Portfolio' },
];

const TIME_WINDOW_DAYS: Record<TimeWindow, number | null> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  'ALL': null,
};

const BENCHMARK_OPTIONS = [
  { symbol: 'SPY', label: 'S&P 500', color: '#4ECDC4', free: true },
  { symbol: 'QQQ', label: 'NASDAQ', color: '#F59E0B', free: false },
  { symbol: 'AGG', label: 'Bonds', color: '#22C55E', free: false },
  { symbol: 'GLD', label: 'Gold', color: '#FBBF24', free: false },
];

export function ChartsScreen() {
  const navigation = useNavigation();
  const { portfolio, holdings, pricesBySymbol, loading, refresh, valueHistory, fxRates, portfolios } = usePortfolio();
  const { isPro, refresh: refreshEntitlements } = useEntitlements();

  useFocusEffect(
    useCallback(() => {
      refreshEntitlements();
    }, [refreshEntitlements])
  );

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1M');
  const [chartView, setChartView] = useState<ChartView>('fundamentals');
  const [selectedBenchmarks, setSelectedBenchmarks] = useState<string[]>([]);

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency, fxRates),
    [holdings, pricesBySymbol, baseCurrency, fxRates]
  );

  // Multi-benchmark data: only fetch when Pro to avoid rate limits (free users see Indices at a glance from cache)
  const benchmarkSymbolsForChart = isPro ? selectedBenchmarks : [];
  const benchmarkConfig = useMemo(
    () => BENCHMARK_OPTIONS.filter((b) => selectedBenchmarks.includes(b.symbol)),
    [selectedBenchmarks]
  );
  const benchmark = useMultiBenchmarkData(timeWindow, benchmarkSymbolsForChart, valueHistory, benchmarkConfig);

  const handleTabPress = (key: ChartView) => {
    setChartView(key);
  };

  const toggleBenchmark = (symbol: string) => {
    if (!isPro) {
      (navigation as any).navigate('Paywall', {
        trigger: 'Unlock Pro to compare your portfolio to S&P 500, NASDAQ & more',
      });
      return;
    }
    setSelectedBenchmarks((prev) =>
      prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]
    );
  };

  const hasBenchmarks = isPro && selectedBenchmarks.length > 0;
  const portfolioChangeResult = useMemo(
    () => portfolioChange(holdings, pricesBySymbol, baseCurrency, fxRates),
    [holdings, pricesBySymbol, baseCurrency, fxRates]
  );

  // Allocation is a Pro feature (Deep Analysis only)
  // Filter value history by time window
  const filteredHistory = useMemo(() => {
    const days = TIME_WINDOW_DAYS[timeWindow];
    if (days === null) return valueHistory;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();
    return valueHistory.filter(v => v.timestamp >= sinceISO);
  }, [valueHistory, timeWindow]);

  // Portfolio value chart data (absolute or % return when benchmark active)
  const portfolioChartData = useMemo(() => {
    // Benchmark mode: show % returns with multiple benchmarks
    if (hasBenchmarks && benchmark.portfolioReturns && benchmark.labels) {
      const allValues = [...benchmark.portfolioReturns];
      for (const b of benchmark.benchmarks) {
        allValues.push(...b.returns);
      }
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      const range = max - min || 1;
      const pad = range * 0.15;

      // Padding dataset must match label/data length to avoid chart-kit glitches
      const paddingDataset = benchmark.portfolioReturns.map((_, idx) =>
        idx % 2 === 0 ? min - pad : max + pad
      );

      const datasets = [
        { data: benchmark.portfolioReturns, color: (): string => theme.colors.white, strokeWidth: 3 },
        ...benchmark.benchmarks.map((b) => ({
          data: b.returns,
          color: (): string => b.color,
          strokeWidth: 2,
        })),
        {
          data: paddingDataset,
          color: (): string => 'transparent',
          strokeWidth: 0,
          withDots: false,
        },
      ];

      return { labels: benchmark.labels, datasets };
    }

    // Normal mode: show absolute values
    const labels: string[] = [];
    const values: number[] = [];

    if (filteredHistory.length >= 2) {
      filteredHistory.forEach((s, i) => {
        values.push(s.valueBase);
        const isFirst = i === 0;
        const isLast = i === filteredHistory.length - 1;
        const d = new Date(s.timestamp);
        if (isFirst || isLast) {
          labels.push(
            d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          );
        } else {
          labels.push('');
        }
      });
    } else {
      const now = withValues.reduce((sum, h) => sum + h.valueBase, 0);
      values.push(now, now);
      labels.push('Start', 'Now');
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = range * 0.12;

    // Padding dataset must match label/data length to avoid chart-kit glitches
    const paddingDataset = values.map((_, idx) =>
      idx % 2 === 0 ? min - pad : max + pad
    );

    return {
      labels,
      datasets: [
        { data: values, color: (): string => theme.colors.white, strokeWidth: 3 },
        {
          data: paddingDataset,
          color: (): string => 'transparent',
          strokeWidth: 0,
          withDots: false,
        },
      ],
    };
  }, [filteredHistory, withValues, hasBenchmarks, benchmark]);

  const screenWidth = Dimensions.get('window').width;

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
        <Text style={styles.emptyText}>
          Add assets to your portfolio to see breakdowns and performance analysis.
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
      {portfolio && (
        <Text style={styles.portfolioLabel}>Breakdown for {portfolio.name}</Text>
      )}

      {/* Scrollable Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
      >
        <View style={styles.tabsContainer}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, chartView === tab.key && styles.tabActive]}
              onPress={() => handleTabPress(tab.key)}
            >
              <Text style={[styles.tabText, chartView === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Compare Portfolios (Pro, 2+ portfolios) */}
      {portfolios.length >= 2 && (
        <TouchableOpacity
          style={styles.compareButton}
          onPress={() => {
            if (!isPro) {
              (navigation as any).navigate('Paywall', { trigger: 'Unlock portfolio comparison — side-by-side performance' });
              return;
            }
            (navigation as any).navigate('PortfolioComparison');
          }}
        >
          <Text style={styles.compareButtonText}>
            Compare Portfolios{!isPro ? ' (Pro)' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Portfolio Value Chart */}
      {chartView === 'portfolio' && (
        <View style={styles.chartSection}>
          {/* Indices at a glance (cache-only; no candle API calls) */}
          <IndicesAtAGlance
            portfolioChangePct={
              portfolioChangeResult?.pct != null ? portfolioChangeResult.pct * 100 : null
            }
          />

          {/* Time Window Row */}
          <View style={styles.timeWindowRow}>
            {(['7D', '1M', '3M', 'ALL'] as TimeWindow[]).map((w) => (
              <TouchableOpacity
                key={w}
                style={[styles.timeWindowPill, timeWindow === w && styles.timeWindowPillActive]}
                onPress={() => setTimeWindow(w)}
              >
                <Text style={[styles.timeWindowText, timeWindow === w && styles.timeWindowTextActive]}>
                  {w}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Benchmark Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.benchmarkRow}>
            <View style={styles.benchmarkPillsContainer}>
              {BENCHMARK_OPTIONS.map((opt) => {
                const active = selectedBenchmarks.includes(opt.symbol);
                return (
                  <TouchableOpacity
                    key={opt.symbol}
                    style={[
                      styles.benchmarkToggle,
                      active && { backgroundColor: opt.color + '20', borderColor: opt.color },
                    ]}
                    onPress={() => toggleBenchmark(opt.symbol)}
                  >
                    <View style={[styles.benchmarkDot, active && { backgroundColor: opt.color }]} />
                    <Text style={[styles.benchmarkText, active && { color: opt.color }]}>
                      {opt.label}
                    </Text>
                    {!isPro && (
                      <Text style={styles.proBadge}>PRO</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {/* Loading / error state */}
          {benchmark.loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              <Text style={styles.loadingText}>Loading benchmark data…</Text>
            </View>
          )}
          {benchmark.error != null && !benchmark.loading && (
            <View style={styles.loadingRow}>
              <Text style={styles.errorText}>{benchmark.error}</Text>
            </View>
          )}

          <View style={styles.chartCard}>
            <LineChart
              data={portfolioChartData}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: 'transparent',
                backgroundGradientTo: 'transparent',
                decimalPlaces: hasBenchmarks ? 1 : 0,
                color: (): string => theme.colors.white,
                strokeWidth: 3,
                linejoinType: 'round',
                labelColor: (): string => theme.colors.textSecondary,
                propsForDots: { r: 0 },
                propsForLabels: { fontSize: 12 },
              }}
              withShadow={false}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLabels={false}
              withHorizontalLabels={hasBenchmarks}
              fromZero={false}
              style={styles.chart}
            />

            {/* Legend for benchmark mode */}
            {hasBenchmarks && (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: theme.colors.white }]} />
                  <Text style={styles.legendLabel}>Portfolio</Text>
                </View>
                {benchmark.benchmarks.map((b) => (
                  <View key={b.symbol} style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: b.color }]} />
                    <Text style={styles.legendLabel}>{b.label}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.chartCaption}>
              {hasBenchmarks
                ? `Performance comparison (% return, ${timeWindow === 'ALL' ? 'all time' : timeWindow.toLowerCase()})`
                : filteredHistory.length >= 2
                  ? `Portfolio value over ${timeWindow === 'ALL' ? 'all time' : timeWindow.toLowerCase()}`
                  : 'Add more data points by refreshing over time'}
            </Text>
          </View>
        </View>
      )}

      {/* Events Timeline */}
      {chartView === 'events' && (
        <EventsTimeline
          portfolioId={portfolio?.id ?? null}
          holdings={holdings}
        />
      )}

      {/* Fundamentals (EPS + Metrics) */}
      {chartView === 'fundamentals' && (
        <FundamentalsView holdings={holdings} />
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
    textAlign: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  portfolioLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },

  // Tabs
  tabsScroll: {
    marginBottom: theme.spacing.sm,
    flexGrow: 0,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  tab: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
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

  // Chart sections
  chartSection: {
    marginBottom: theme.spacing.sm,
  },
  chartStyleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  chartStyleToggle: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  chartStylePill: {
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  chartStylePillActive: {
    backgroundColor: theme.colors.textPrimary,
  },
  chartStyleText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  chartStyleTextActive: {
    ...theme.typography.small,
    color: theme.colors.background,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  loadingText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  errorText: {
    ...theme.typography.small,
    color: theme.colors.negative,
  },
  timeWindowRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  timeWindowPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeWindowPillActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  timeWindowText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  timeWindowTextActive: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
  },

  // Benchmark pills
  benchmarkRow: {
    marginBottom: theme.spacing.sm,
    flexGrow: 0,
  },
  benchmarkPillsContainer: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  benchmarkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  benchmarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.textTertiary,
    marginRight: 6,
  },
  benchmarkText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  proBadge: {
    ...theme.typography.small,
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textTertiary,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: theme.colors.textTertiary,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  // Chart card
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
  },
  chart: {
    borderRadius: theme.radius.sm,
  },
  chartCaption: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
  },

  // Benchmark legend
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendLine: {
    width: 16,
    height: 3,
    borderRadius: 2,
    marginRight: 6,
  },
  legendLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },

  // Compare button
  compareButton: {
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  compareButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
