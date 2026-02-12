import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { usePortfolio } from '../portfolio/usePortfolio';
import { usePortfolioComparison } from './hooks/usePortfolioComparison';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';

export function PortfolioComparisonScreen() {
  const { portfolios, activePortfolioId } = usePortfolio();
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1M');
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    // Pre-select all portfolios (max 4)
    return portfolios.slice(0, 4).map((p) => p.id);
  });

  const portfolioNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of portfolios) map[p.id] = p.name;
    return map;
  }, [portfolios]);

  const { series, labels, loading } = usePortfolioComparison(selectedIds, portfolioNames, timeWindow);

  const togglePortfolio = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.length > 1 ? prev.filter((x) => x !== id) : prev;
      }
      return prev.length < 4 ? [...prev, id] : prev;
    });
  };

  const screenWidth = Dimensions.get('window').width;

  const chartData = useMemo(() => {
    if (!labels || series.length === 0) return null;

    const allValues = series.flatMap((s) => s.returns);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    const pad = range * 0.15;

    const datasets = [
      ...series.map((s) => ({
        data: s.returns,
        color: (): string => s.color,
        strokeWidth: s.portfolioId === activePortfolioId ? 3 : 2,
      })),
      { data: [min - pad, max + pad], color: (): string => 'transparent', strokeWidth: 0, withDots: false },
    ];

    return { labels, datasets };
  }, [series, labels, activePortfolioId]);

  if (portfolios.length < 2) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Need 2+ portfolios</Text>
        <Text style={styles.emptyText}>
          Create additional portfolios to compare their performance side by side.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Portfolio selection pills */}
      <Text style={styles.sectionLabel}>Select portfolios to compare</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsScroll}>
        <View style={styles.pillsRow}>
          {portfolios.map((p, i) => {
            const active = selectedIds.includes(p.id);
            const colorIdx = selectedIds.indexOf(p.id);
            const color = colorIdx >= 0 ? ['#FFFFFF', '#4ECDC4', '#F59E0B', '#22C55E'][colorIdx % 4] : theme.colors.textTertiary;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.pill, active && { borderColor: color, backgroundColor: color + '15' }]}
                onPress={() => togglePortfolio(p.id)}
              >
                {active && <View style={[styles.pillDot, { backgroundColor: color }]} />}
                <Text style={[styles.pillText, active && { color }]}>{p.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Time window selector */}
      <View style={styles.timeRow}>
        {(['7D', '1M', '3M', 'ALL'] as TimeWindow[]).map((w) => (
          <TouchableOpacity
            key={w}
            style={[styles.timePill, timeWindow === w && styles.timePillActive]}
            onPress={() => setTimeWindow(w)}
          >
            <Text style={[styles.timeText, timeWindow === w && styles.timeTextActive]}>{w}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Chart */}
      {loading && (
        <Text style={styles.loadingText}>Loading comparison data...</Text>
      )}
      {!loading && chartData && (
        <View style={styles.chartCard}>
          <LineChart
            data={chartData}
            width={screenWidth - 32}
            height={240}
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: 'transparent',
              backgroundGradientTo: 'transparent',
              decimalPlaces: 1,
              color: (): string => theme.colors.white,
              strokeWidth: 2,
              linejoinType: 'round',
              labelColor: (): string => theme.colors.textSecondary,
              propsForDots: { r: 0 },
              propsForLabels: { fontSize: 10 },
            }}
            withShadow={false}
            withInnerLines={false}
            withOuterLines={false}
            withVerticalLabels={false}
            withHorizontalLabels
            fromZero={false}
            style={styles.chart}
          />
          <Text style={styles.chartCaption}>
            Performance comparison (% return, {timeWindow === 'ALL' ? 'all time' : timeWindow.toLowerCase()})
          </Text>
        </View>
      )}
      {!loading && !chartData && selectedIds.length > 0 && (
        <View style={styles.chartCard}>
          <Text style={styles.emptyText}>
            Not enough history to compare. Keep refreshing to collect data points.
          </Text>
        </View>
      )}

      {/* Legend + summary table */}
      {series.length > 0 && (
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          {series.map((s) => {
            const lastReturn = s.returns.length > 0 ? s.returns[s.returns.length - 1] : 0;
            return (
              <View key={s.portfolioId} style={styles.summaryRow}>
                <View style={styles.summaryLeft}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text style={styles.summaryName} numberOfLines={1}>{s.portfolioName}</Text>
                </View>
                <Text
                  style={[
                    styles.summaryReturn,
                    { color: lastReturn >= 0 ? theme.colors.positive : theme.colors.negative },
                  ]}
                >
                  {lastReturn >= 0 ? '+' : ''}{lastReturn.toFixed(2)}%
                </Text>
              </View>
            );
          })}
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
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  sectionLabel: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  pillsScroll: {
    marginBottom: theme.spacing.sm,
    flexGrow: 0,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  pillText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  timeRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  timePill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  timePillActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  timeText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  timeTextActive: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
  },
  loadingText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
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
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
  },
  summaryTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  summaryName: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  summaryReturn: {
    ...theme.typography.captionMedium,
  },
});
