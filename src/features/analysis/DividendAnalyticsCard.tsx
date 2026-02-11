import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import type { DividendAnalytics } from './hooks/useDividendAnalytics';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';

interface Props {
  analytics: DividendAnalytics;
  baseCurrency: string;
}

export function DividendAnalyticsCard({ analytics, baseCurrency }: Props) {
  const { ttmIncome, monthlyData, holdingRows } = analytics;
  const screenWidth = Dimensions.get('window').width;

  if (holdingRows.length === 0 && ttmIncome === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Dividend Analytics</Text>
        <Text style={styles.emptyText}>
          No dividend income recorded yet. Log dividends from holding details to see analytics.
        </Text>
      </View>
    );
  }

  // Prepare bar chart data (last 12 months)
  const chartLabels = monthlyData.map((m) => {
    const [, month] = m.month.split('-');
    const monthNames = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
    return monthNames[parseInt(month, 10) - 1] ?? '';
  });
  const chartValues = monthlyData.map((m) => m.amount);
  // Ensure at least 1 value for chart
  const safeValues = chartValues.length > 0 ? chartValues : [0];
  const safeLabels = chartLabels.length > 0 ? chartLabels : [''];

  return (
    <View>
      {/* TTM Summary */}
      <View style={styles.card}>
        <Text style={styles.title}>Dividend Income (TTM)</Text>
        <Text style={styles.ttmValue}>{formatMoney(ttmIncome, baseCurrency)}</Text>
        <Text style={styles.ttmHint}>
          Trailing 12-month dividend income across all holdings
        </Text>
      </View>

      {/* Monthly Bar Chart */}
      {monthlyData.some((m) => m.amount > 0) && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Monthly Income</Text>
          <BarChart
            data={{
              labels: safeLabels,
              datasets: [{ data: safeValues }],
            }}
            width={screenWidth - 48}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: 'transparent',
              backgroundGradientTo: 'transparent',
              decimalPlaces: 0,
              color: (): string => theme.colors.positive,
              labelColor: (): string => theme.colors.textSecondary,
              barPercentage: 0.5,
              propsForLabels: { fontSize: 10 },
            }}
            withInnerLines={false}
            fromZero
            style={styles.chart}
          />
        </View>
      )}

      {/* Per-holding table */}
      {holdingRows.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.subtitle}>By Holding</Text>
          {holdingRows.map((row) => (
            <View key={row.holdingId} style={styles.holdingRow}>
              <View style={styles.holdingLeft}>
                <Text style={styles.holdingName} numberOfLines={1}>{row.name}</Text>
                {row.symbol && <Text style={styles.holdingSymbol}>{row.symbol}</Text>}
              </View>
              <View style={styles.holdingRight}>
                <Text style={styles.holdingAmount}>
                  {formatMoney(row.ttmAmount, baseCurrency)}
                </Text>
                {row.yieldOnCost != null && (
                  <Text style={styles.holdingYield}>
                    {row.yieldOnCost.toFixed(1)}% YoC
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  title: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptyText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  ttmValue: {
    ...theme.typography.title2,
    color: theme.colors.positive,
    marginBottom: 4,
  },
  ttmHint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  chart: {
    borderRadius: theme.radius.sm,
    marginLeft: -8,
  },
  holdingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  holdingLeft: {
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  holdingName: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
  },
  holdingSymbol: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  holdingRight: {
    alignItems: 'flex-end',
  },
  holdingAmount: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  holdingYield: {
    ...theme.typography.small,
    color: theme.colors.positive,
  },
});
