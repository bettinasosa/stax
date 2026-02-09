import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import type { Holding } from '../../data/schemas';
import { useEarningsData } from './hooks/useEarningsData';
import { useFinancialMetrics } from './hooks/useFinancialMetrics';
import { theme } from '../../utils/theme';

type EpsPeriod = 'quarterly' | 'annual';

interface Props {
  holdings: Holding[];
}

const screenWidth = Dimensions.get('window').width;

export function FundamentalsView({ holdings }: Props) {
  const stockHoldings = useMemo(
    () =>
      holdings.filter(
        (h) =>
          (h.type === 'stock' || h.type === 'etf') && h.symbol != null
      ),
    [holdings]
  );

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    stockHoldings[0]?.symbol ?? null
  );
  const [epsPeriod, setEpsPeriod] = useState<EpsPeriod>('quarterly');

  const { earnings, loading: earningsLoading } = useEarningsData(selectedSymbol);
  const { metrics, loading: metricsLoading } = useFinancialMetrics(selectedSymbol);

  // EPS chart data
  const epsChartData = useMemo(() => {
    if (earnings.length === 0) return null;

    let items = [...earnings].reverse(); // oldest first

    if (epsPeriod === 'annual') {
      // Group by year, average actuals
      const byYear = new Map<number, { actual: number[]; estimate: number[] }>();
      for (const e of items) {
        if (!byYear.has(e.year)) byYear.set(e.year, { actual: [], estimate: [] });
        const y = byYear.get(e.year)!;
        if (e.actual != null) y.actual.push(e.actual);
        if (e.estimate != null) y.estimate.push(e.estimate);
      }
      const years = Array.from(byYear.keys()).sort();
      const labels = years.map((y) => String(y));
      const data = years.map((y) => {
        const vals = byYear.get(y)!.actual.filter((v) => Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : 0;
      });
      return { labels: labels.slice(-6), data: data.slice(-6) };
    }

    // Quarterly: last 8 quarters
    items = items.slice(-8);
    const labels = items.map((e) => `Q${e.quarter} '${String(e.year).slice(2)}`);
    const data = items.map((e) => e.actual ?? 0);
    return { labels, data };
  }, [earnings, epsPeriod]);

  // EPS surprise data for display below chart
  const epsSurpriseData = useMemo(() => {
    if (earnings.length === 0) return [];
    let items = [...earnings].reverse();
    if (epsPeriod === 'quarterly') {
      items = items.slice(-8);
    }
    return items.map((e) => ({
      period: epsPeriod === 'quarterly' ? `Q${e.quarter} '${String(e.year).slice(2)}` : String(e.year),
      actual: e.actual,
      estimate: e.estimate,
      surprise: e.surprisePercent,
    }));
  }, [earnings, epsPeriod]);

  // Key financial metrics to display
  const metricCards = useMemo(() => {
    if (!metrics?.metric) return [];
    const m = metrics.metric;
    return [
      { label: 'P/E Ratio', value: formatMetric(m.peBasicExclExtraTTM, 1) },
      { label: 'EPS (TTM)', value: formatMetric(m.epsBasicExclExtraItemsTTM, 2, '$') },
      { label: 'Revenue/Share', value: formatMetric(m.revenuePerShareTTM, 2, '$') },
      { label: 'Price/Book', value: formatMetric(m.pbAnnual, 2) },
      { label: 'Dividend Yield', value: formatMetric(m.dividendYieldIndicatedAnnual, 2, '', '%') },
      { label: 'ROE', value: formatMetric(m.roeTTM, 1, '', '%') },
      { label: 'Debt/Equity', value: formatMetric(m['totalDebt/totalEquityQuarterly'], 2) },
      { label: 'Net Margin', value: formatMetric(m.netProfitMarginTTM, 1, '', '%') },
      { label: '52W High', value: formatMetric(m['52WeekHigh'], 2, '$') },
      { label: '52W Low', value: formatMetric(m['52WeekLow'], 2, '$') },
      { label: 'Beta', value: formatMetric(m.beta, 2) },
      { label: 'Market Cap', value: formatLargeNumber(m.marketCapitalization) },
    ].filter((c) => c.value !== '—');
  }, [metrics]);

  if (stockHoldings.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No stock holdings</Text>
        <Text style={styles.emptyText}>
          Add stocks or ETFs to your portfolio to see earnings and financial metrics.
        </Text>
      </View>
    );
  }

  const loading = earningsLoading || metricsLoading;

  return (
    <View style={styles.container}>
      {/* Stock picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pickerScroll}
      >
        <View style={styles.pickerRow}>
          {stockHoldings.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[
                styles.pickerChip,
                selectedSymbol === h.symbol && styles.pickerChipActive,
              ]}
              onPress={() => setSelectedSymbol(h.symbol!)}
            >
              <Text
                style={[
                  styles.pickerText,
                  selectedSymbol === h.symbol && styles.pickerTextActive,
                ]}
                numberOfLines={1}
              >
                {h.symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.textPrimary} />
        </View>
      ) : (
        <>
          {/* EPS Section */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Earnings Per Share</Text>

            {/* Annual / Quarterly toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, epsPeriod === 'quarterly' && styles.toggleBtnActive]}
                onPress={() => setEpsPeriod('quarterly')}
              >
                <Text style={[styles.toggleText, epsPeriod === 'quarterly' && styles.toggleTextActive]}>
                  Quarterly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, epsPeriod === 'annual' && styles.toggleBtnActive]}
                onPress={() => setEpsPeriod('annual')}
              >
                <Text style={[styles.toggleText, epsPeriod === 'annual' && styles.toggleTextActive]}>
                  Annual
                </Text>
              </TouchableOpacity>
            </View>

            {epsChartData && epsChartData.data.length > 0 ? (
              <>
                <BarChart
                  data={{
                    labels: epsChartData.labels,
                    datasets: [{ data: epsChartData.data }],
                  }}
                  width={screenWidth - 64}
                  height={180}
                  yAxisLabel="$"
                  yAxisSuffix=""
                  chartConfig={{
                    backgroundColor: 'transparent',
                    backgroundGradientFrom: 'transparent',
                    backgroundGradientTo: 'transparent',
                    decimalPlaces: 2,
                    color: () => theme.colors.white,
                    labelColor: () => theme.colors.textSecondary,
                    propsForLabels: { fontSize: 9 },
                    barPercentage: 0.6,
                  }}
                  fromZero
                  withInnerLines={false}
                  style={styles.chart}
                />

                {/* Surprise table */}
                {epsPeriod === 'quarterly' && epsSurpriseData.length > 0 && (
                  <View style={styles.surpriseTable}>
                    <View style={styles.surpriseHeader}>
                      <Text style={[styles.surpriseCell, styles.surprisePeriod]}>Period</Text>
                      <Text style={styles.surpriseCell}>Actual</Text>
                      <Text style={styles.surpriseCell}>Est.</Text>
                      <Text style={[styles.surpriseCell, { textAlign: 'right' }]}>Surprise</Text>
                    </View>
                    {epsSurpriseData.slice(-8).map((row) => (
                      <View key={row.period} style={styles.surpriseRow}>
                        <Text style={[styles.surpriseCell, styles.surprisePeriod]}>
                          {row.period}
                        </Text>
                        <Text style={styles.surpriseCell}>
                          {row.actual != null ? `$${row.actual.toFixed(2)}` : '—'}
                        </Text>
                        <Text style={styles.surpriseCell}>
                          {row.estimate != null ? `$${row.estimate.toFixed(2)}` : '—'}
                        </Text>
                        <Text
                          style={[
                            styles.surpriseCell,
                            {
                              textAlign: 'right',
                              color:
                                row.surprise != null && row.surprise >= 0
                                  ? theme.colors.positive
                                  : theme.colors.negative,
                            },
                          ]}
                        >
                          {row.surprise != null ? `${row.surprise >= 0 ? '+' : ''}${row.surprise.toFixed(1)}%` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.noDataText}>No earnings data available for {selectedSymbol}</Text>
            )}
          </View>

          {/* Key Metrics Section */}
          {metricCards.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Financial Performance</Text>
              <View style={styles.metricsGrid}>
                {metricCards.map((c) => (
                  <View key={c.label} style={styles.metricCard}>
                    <Text style={styles.metricLabel}>{c.label}</Text>
                    <Text style={styles.metricValue}>{c.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function formatMetric(
  value: number | null | undefined,
  decimals: number,
  prefix = '',
  suffix = ''
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  // Finnhub returns market cap in millions
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}T`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.xs },
  centered: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  emptyTitle: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptyText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  pickerScroll: { marginBottom: theme.spacing.sm },
  pickerRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  pickerChip: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pickerChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  pickerText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
  },
  pickerTextActive: {
    color: theme.colors.textPrimary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  toggleText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  toggleTextActive: {
    color: theme.colors.background,
    fontWeight: '500',
  },
  chart: { borderRadius: theme.radius.sm },
  noDataText: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  surpriseTable: {
    marginTop: theme.spacing.sm,
  },
  surpriseHeader: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  surpriseRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  surpriseCell: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  surprisePeriod: {
    color: theme.colors.textTertiary,
    flex: 0.8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metricCard: {
    flexBasis: '48%',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  metricLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  metricValue: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
});
