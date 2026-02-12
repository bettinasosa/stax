import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { PerformanceResult } from './analysisUtils';
import { computeAttributionByClass } from './analysisUtils';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';

const PNL_SHOW_MORE_THRESHOLD = 5;

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
  const [pnlExpanded, setPnlExpanded] = useState(false);
  const hasPerf = bestPerformers.length > 0 || worstPerformers.length > 0;
  const hasPnl = unrealizedPnl.length > 0;
  const attribution = computeAttributionByClass(unrealizedPnl);
  const showAttribution = attribution.length >= 2;
  const pnlDisplayList = pnlExpanded ? unrealizedPnl : unrealizedPnl.slice(0, PNL_SHOW_MORE_THRESHOLD);
  const hasMorePnl = unrealizedPnl.length > PNL_SHOW_MORE_THRESHOLD;

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
              <Text style={styles.blockSubLabel}>Daily change</Text>
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
              <Text style={styles.blockSubLabel}>Daily change</Text>
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
          <Text style={styles.blockSubLabel}>Since purchase</Text>
          {showAttribution && (
            <View style={styles.attributionBlock}>
              {attribution.map((row) => (
                <View key={row.assetClass} style={styles.attributionRow}>
                  <View style={styles.attributionBadge}>
                    <Text style={styles.attributionBadgeText}>{row.assetClass}</Text>
                  </View>
                  <Text
                    style={[
                      styles.attributionValue,
                      { color: row.pnl >= 0 ? theme.colors.positive : theme.colors.negative },
                    ]}
                  >
                    {row.pnl >= 0 ? '+' : ''}
                    {formatMoney(row.pnl, baseCurrency)} ({row.pnlPct >= 0 ? '+' : ''}
                    {row.pnlPct.toFixed(1)}%)
                  </Text>
                </View>
              ))}
            </View>
          )}
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
          {pnlDisplayList.map((r) => (
            <View key={r.holdingId} style={styles.perfRow}>
              <Text style={styles.perfName} numberOfLines={1}>{r.name}</Text>
              <View style={styles.perfValueRight}>
                <Text
                  style={[
                    styles.pnlPctHighlight,
                    { color: r.pnlPct >= 0 ? theme.colors.positive : theme.colors.negative },
                  ]}
                >
                  {r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(1)}%
                </Text>
                <Text
                  style={[
                    styles.perfValue,
                    { color: r.pnl >= 0 ? theme.colors.positive : theme.colors.negative },
                  ]}
                >
                  {r.pnl >= 0 ? '+' : ''}
                  {formatMoney(r.pnl, baseCurrency)}
                </Text>
              </View>
            </View>
          ))}
          {hasMorePnl && (
            <TouchableOpacity
              style={styles.showMoreBtn}
              onPress={() => setPnlExpanded((prev) => !prev)}
            >
              <Text style={styles.showMoreText}>
                {pnlExpanded ? 'Show less' : 'Show more'}
              </Text>
            </TouchableOpacity>
          )}
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
    marginBottom: 2,
  },
  blockSubLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: 6,
  },
  attributionBlock: {
    marginBottom: theme.spacing.sm,
  },
  attributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: 3,
  },
  attributionBadge: {
    backgroundColor: theme.colors.border,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  attributionBadgeText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },
  attributionValue: {
    ...theme.typography.small,
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
  perfValueRight: {
    alignItems: 'flex-end',
  },
  pnlPctHighlight: {
    ...theme.typography.captionMedium,
  },
  perfValue: { ...theme.typography.small },
  showMoreBtn: {
    paddingVertical: theme.spacing.xs,
    marginTop: 4,
    alignItems: 'center',
  },
  showMoreText: {
    ...theme.typography.small,
    color: theme.colors.accent,
  },
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
