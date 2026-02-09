import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { PerformanceResult } from './analysisUtils';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';

interface PerformanceCardProps {
  performance: PerformanceResult;
  baseCurrency: string;
}

/**
 * Shows best/worst daily performers and unrealized P&L breakdown.
 */
export function PerformanceCard({ performance, baseCurrency }: PerformanceCardProps) {
  const { bestPerformers, worstPerformers, unrealizedPnl, totalUnrealizedPnl, coveragePercent } =
    performance;
  const hasPerf = bestPerformers.length > 0 || worstPerformers.length > 0;
  const hasPnl = unrealizedPnl.length > 0;

  if (!hasPerf && !hasPnl) {
    return (
      <Text style={styles.empty}>
        Add listed holdings with cost basis to see performance data.
      </Text>
    );
  }

  return (
    <View>
      {hasPerf && (
        <>
          {bestPerformers.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Best today</Text>
              {bestPerformers.map((r) => (
                <View key={r.holdingId} style={styles.perfRow}>
                  <Text style={styles.perfName} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.perfValue, { color: theme.colors.positive }]}>
                    +{r.returnPct.toFixed(2)}%
                  </Text>
                </View>
              ))}
            </View>
          )}
          {worstPerformers.length > 0 && (
            <View style={styles.block}>
              <Text style={styles.blockLabel}>Worst today</Text>
              {worstPerformers.map((r) => (
                <View key={r.holdingId} style={styles.perfRow}>
                  <Text style={styles.perfName} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.perfValue, { color: theme.colors.negative }]}>
                    {r.returnPct.toFixed(2)}%
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {hasPnl && (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Unrealized P&L</Text>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text
              style={[
                styles.totalValue,
                { color: totalUnrealizedPnl >= 0 ? theme.colors.positive : theme.colors.negative },
              ]}
            >
              {totalUnrealizedPnl >= 0 ? '+' : ''}
              {formatMoney(totalUnrealizedPnl, baseCurrency)}
            </Text>
          </View>
          {unrealizedPnl.slice(0, 5).map((r) => (
            <View key={r.holdingId} style={styles.perfRow}>
              <Text style={styles.perfName} numberOfLines={1}>{r.name}</Text>
              <Text
                style={[
                  styles.perfValue,
                  { color: r.pnl >= 0 ? theme.colors.positive : theme.colors.negative },
                ]}
              >
                {r.pnl >= 0 ? '+' : ''}
                {formatMoney(r.pnl, baseCurrency)} ({r.pnlPct >= 0 ? '+' : ''}
                {r.pnlPct.toFixed(1)}%)
              </Text>
            </View>
          ))}
          {coveragePercent < 100 && (
            <Text style={styles.coverageNote}>
              Cost basis data covers {coveragePercent.toFixed(0)}% of portfolio value.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    paddingVertical: theme.spacing.sm,
  },
  block: { marginBottom: theme.spacing.xs },
  blockLabel: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  perfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: 3,
  },
  perfName: {
    ...theme.typography.small,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  perfValue: { ...theme.typography.small },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: 6,
  },
  totalLabel: { ...theme.typography.captionMedium, color: theme.colors.textPrimary },
  totalValue: { ...theme.typography.captionMedium },
  coverageNote: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: 4,
  },
});
