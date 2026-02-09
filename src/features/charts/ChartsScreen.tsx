import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LineChart, PieChart, BarChart } from 'react-native-chart-kit';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingsWithValues, allocationByAssetClass } from '../portfolio/portfolioUtils';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';
import { useBenchmarkData } from './hooks/useBenchmarkData';
import { EventsTimeline } from './EventsTimeline';
import { FundamentalsView } from './FundamentalsView';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';
type ChartView = 'portfolio' | 'allocation' | 'performance' | 'events' | 'fundamentals';

const TABS: { key: ChartView; label: string }[] = [
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'allocation', label: 'Allocation' },
  { key: 'performance', label: 'Top Holdings' },
  { key: 'events', label: 'Events' },
  { key: 'fundamentals', label: 'Fundamentals' },
];

const TIME_WINDOW_DAYS: Record<TimeWindow, number | null> = {
  '7D': 7,
  '1M': 30,
  '3M': 90,
  'ALL': null,
};

const CHART_COLORS = [
  theme.colors.white,
  '#4ECDC4',
  '#FF6B6B',
  '#FFE66D',
  '#95E1D3',
  '#F38181',
  '#AA96DA',
  '#FCBAD3',
];

const BENCHMARK_COLOR = '#4ECDC4';

export function ChartsScreen() {
  const { portfolio, holdings, pricesBySymbol, loading, refresh, valueHistory } = usePortfolio();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1M');
  const [chartView, setChartView] = useState<ChartView>('portfolio');
  const [showBenchmark, setShowBenchmark] = useState(false);

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency),
    [holdings, pricesBySymbol, baseCurrency]
  );

  // Benchmark data (SPY)
  const benchmark = useBenchmarkData(timeWindow, showBenchmark, valueHistory);

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
    // Benchmark mode: show % returns
    if (showBenchmark && benchmark.portfolioReturns && benchmark.spyReturns && benchmark.labels) {
      const allValues = [...benchmark.portfolioReturns, ...benchmark.spyReturns];
      const min = Math.min(...allValues);
      const max = Math.max(...allValues);
      const range = max - min || 1;
      const pad = range * 0.15;

      return {
        labels: benchmark.labels,
        datasets: [
          { data: benchmark.portfolioReturns, color: (): string => theme.colors.white, strokeWidth: 3 },
          { data: benchmark.spyReturns, color: (): string => BENCHMARK_COLOR, strokeWidth: 2 },
          { data: [min - pad, max + pad], color: (): string => 'transparent', strokeWidth: 0, withDots: false },
        ],
        legend: ['Portfolio', 'S&P 500'],
      };
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

    return {
      labels,
      datasets: [
        { data: values, color: () => theme.colors.white, strokeWidth: 3 },
        { data: [min - pad, max + pad], color: () => 'transparent', strokeWidth: 0, withDots: false },
      ],
    };
  }, [filteredHistory, withValues, showBenchmark, benchmark]);

  // Allocation pie chart data
  const allocationChartData = useMemo(() => {
    const allocation = allocationByAssetClass(withValues);
    if (allocation.length === 0) return [];

    return allocation.map((a, i) => ({
      name: a.assetClass.replace(/_/g, ' '),
      value: a.value,
      percent: a.percent,
      color: CHART_COLORS[i % CHART_COLORS.length],
      legendFontColor: theme.colors.textSecondary,
      legendFontSize: 12,
    }));
  }, [withValues]);

  // Top holdings bar chart data
  const performanceChartData = useMemo(() => {
    const top5 = withValues.slice(0, 5);
    if (top5.length === 0) {
      return {
        labels: [''],
        datasets: [{ data: [0] }],
      };
    }

    const labels = top5.map(h => {
      const name = h.holding.name;
      return name.length > 12 ? name.slice(0, 12) + '\u2026' : name;
    });

    const values = top5.map(h => h.valueBase);

    return {
      labels,
      datasets: [{ data: values, color: () => theme.colors.white }],
    };
  }, [withValues]);

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
          Add assets to your portfolio to see charts and performance analysis.
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
        <Text style={styles.portfolioLabel}>Charts for {portfolio.name}</Text>
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
              onPress={() => setChartView(tab.key)}
            >
              <Text style={[styles.tabText, chartView === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Portfolio Value Chart */}
      {chartView === 'portfolio' && (
        <View style={styles.chartSection}>
          {/* Time Window + Benchmark Row */}
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

          {/* Benchmark Toggle */}
          <TouchableOpacity
            style={[styles.benchmarkToggle, showBenchmark && styles.benchmarkToggleActive]}
            onPress={() => setShowBenchmark(!showBenchmark)}
          >
            <View style={[styles.benchmarkDot, showBenchmark && styles.benchmarkDotActive]} />
            <Text style={[styles.benchmarkText, showBenchmark && styles.benchmarkTextActive]}>
              vs S&P 500
            </Text>
          </TouchableOpacity>

          <View style={styles.chartCard}>
            <LineChart
              data={portfolioChartData}
              width={screenWidth - 32}
              height={220}
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: 'transparent',
                backgroundGradientTo: 'transparent',
                decimalPlaces: showBenchmark ? 1 : 0,
                color: () => theme.colors.white,
                strokeWidth: 3,
                linejoinType: 'round',
                labelColor: () => theme.colors.textSecondary,
                propsForDots: { r: 0 },
                propsForLabels: { fontSize: 10 },
              }}
              bezier
              withShadow={false}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLabels={false}
              withHorizontalLabels={showBenchmark}
              fromZero={false}
              style={styles.chart}
            />

            {/* Legend for benchmark mode */}
            {showBenchmark && (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: theme.colors.white }]} />
                  <Text style={styles.legendLabel}>Portfolio</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendLine, { backgroundColor: BENCHMARK_COLOR }]} />
                  <Text style={styles.legendLabel}>S&P 500</Text>
                </View>
              </View>
            )}

            <Text style={styles.chartCaption}>
              {showBenchmark
                ? `Performance vs S&P 500 (% return, ${timeWindow === 'ALL' ? 'all time' : timeWindow.toLowerCase()})`
                : filteredHistory.length >= 2
                  ? `Portfolio value over ${timeWindow === 'ALL' ? 'all time' : timeWindow.toLowerCase()}`
                  : 'Add more data points by refreshing over time'}
            </Text>
          </View>
        </View>
      )}

      {/* Allocation Pie Chart */}
      {chartView === 'allocation' && (
        <View style={styles.chartSection}>
          <View style={styles.chartCard}>
            {allocationChartData.length > 0 ? (
              <>
                <PieChart
                  data={allocationChartData}
                  width={screenWidth - 32}
                  height={220}
                  chartConfig={{
                    color: () => theme.colors.white,
                  }}
                  accessor="value"
                  backgroundColor="transparent"
                  paddingLeft="15"
                  absolute
                />
                <Text style={styles.chartCaption}>
                  Breakdown by asset class
                </Text>
                <View style={styles.allocationLegend}>
                  {allocationChartData.map((item) => (
                    <View key={item.name} style={styles.allocationLegendRow}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendName}>{item.name}</Text>
                      <Text style={styles.legendValue}>
                        {formatMoney(item.value, baseCurrency)} ({item.percent.toFixed(1)}%)
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>No allocation data available</Text>
            )}
          </View>
        </View>
      )}

      {/* Top Holdings Bar Chart */}
      {chartView === 'performance' && (
        <View style={styles.chartSection}>
          <View style={styles.chartCard}>
            {withValues.length > 0 ? (
              <>
                <BarChart
                  data={performanceChartData}
                  width={screenWidth - 32}
                  height={220}
                  yAxisLabel={baseCurrency === 'USD' ? '$' : ''}
                  yAxisSuffix=""
                  chartConfig={{
                    backgroundColor: 'transparent',
                    backgroundGradientFrom: 'transparent',
                    backgroundGradientTo: 'transparent',
                    decimalPlaces: 0,
                    color: () => theme.colors.white,
                    labelColor: () => theme.colors.textSecondary,
                    propsForLabels: { fontSize: 10 },
                  }}
                  fromZero
                  withInnerLines={false}
                  withHorizontalLabels
                  style={styles.chart}
                />
                <Text style={styles.chartCaption}>
                  Top {Math.min(5, withValues.length)} holdings by value
                </Text>
                <View style={styles.holdingsListContainer}>
                  {withValues.slice(0, 5).map((h, i) => (
                    <View key={h.holding.id} style={styles.holdingRow}>
                      <Text style={styles.holdingRank}>{i + 1}</Text>
                      <Text style={styles.holdingName} numberOfLines={1}>{h.holding.name}</Text>
                      <Text style={styles.holdingValue}>{formatMoney(h.valueBase, baseCurrency)}</Text>
                      <Text style={styles.holdingWeight}>{h.weightPercent.toFixed(1)}%</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.emptyText}>No holdings to display</Text>
            )}
          </View>
        </View>
      )}

      {/* Events Timeline */}
      {chartView === 'events' && (
        <EventsTimeline portfolioId={portfolio?.id ?? null} />
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

  // Benchmark toggle
  benchmarkToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  benchmarkToggleActive: {
    backgroundColor: '#4ECDC420',
    borderColor: BENCHMARK_COLOR,
  },
  benchmarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.textTertiary,
    marginRight: 6,
  },
  benchmarkDotActive: {
    backgroundColor: BENCHMARK_COLOR,
  },
  benchmarkText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  benchmarkTextActive: {
    color: BENCHMARK_COLOR,
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

  // Allocation legend
  allocationLegend: {
    marginTop: theme.spacing.sm,
  },
  allocationLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: theme.spacing.xs,
  },
  legendName: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  legendValue: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },

  // Holdings list
  holdingsListContainer: {
    marginTop: theme.spacing.sm,
  },
  holdingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  holdingRank: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    width: 24,
  },
  holdingName: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  holdingValue: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.xs,
  },
  holdingWeight: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    width: 48,
    textAlign: 'right',
  },
});
