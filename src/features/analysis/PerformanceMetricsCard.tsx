import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { TWRRResult, SharpeResult } from './analysisUtils';
import { theme } from '../../utils/theme';

interface Props {
  twrr: TWRRResult | null;
  sharpe: SharpeResult | null;
}

export function PerformanceMetricsCard({ twrr, sharpe }: Props) {
  if (!twrr && !sharpe) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Performance Metrics</Text>
        <Text style={styles.emptyText}>
          Not enough history yet. Keep refreshing over time to build data points.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Performance Metrics</Text>

      {twrr && (
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>TWRR</Text>
            <Text style={[styles.metricValue, twrr.twrr >= 0 ? styles.positive : styles.negative]}>
              {twrr.twrr >= 0 ? '+' : ''}{(twrr.twrr * 100).toFixed(2)}%
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Annualized</Text>
            <Text style={[styles.metricValue, twrr.annualizedTwrr >= 0 ? styles.positive : styles.negative]}>
              {twrr.annualizedTwrr >= 0 ? '+' : ''}{(twrr.annualizedTwrr * 100).toFixed(2)}%
            </Text>
          </View>
        </View>
      )}

      {sharpe && (
        <View style={styles.metricsRow}>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Sharpe Ratio</Text>
            <Text style={[styles.metricValue, sharpe.sharpe >= 0 ? styles.positive : styles.negative]}>
              {sharpe.sharpe.toFixed(2)}
            </Text>
          </View>
          <View style={styles.metricBox}>
            <Text style={styles.metricLabel}>Volatility</Text>
            <Text style={styles.metricValue}>
              {(sharpe.annualizedVolatility * 100).toFixed(1)}%
            </Text>
          </View>
        </View>
      )}

      <Text style={styles.hint}>
        {sharpe
          ? `Sharpe > 1 = good, > 2 = excellent. Risk-free rate: 4.5%`
          : 'Sharpe ratio requires 20+ data points.'}
      </Text>
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
  emptyText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  metricBox: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  metricLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  metricValue: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
  },
  positive: { color: theme.colors.positive },
  negative: { color: theme.colors.negative },
  hint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
});
