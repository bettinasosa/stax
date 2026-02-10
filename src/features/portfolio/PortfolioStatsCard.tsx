import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../utils/theme';
import { formatMoney } from '../../utils/money';
import type { PortfolioStats } from './portfolioUtils';

interface Props {
  stats: PortfolioStats;
  baseCurrency: string;
}

/**
 * Summary metrics card displayed on the Portfolio Overview tab.
 * Shows cost basis, unrealised gain/loss, concentration, and diversification.
 */
export function PortfolioStatsCard({ stats, baseCurrency }: Props) {
  const gainColor =
    stats.totalGainLoss >= 0 ? theme.colors.positive : theme.colors.negative;
  const gainArrow = stats.totalGainLoss >= 0 ? '+' : '';

  const dayColor =
    stats.dayChangePnl != null && stats.dayChangePnl >= 0
      ? theme.colors.positive
      : theme.colors.negative;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Portfolio Summary</Text>

      {/* Row 1: Cost Basis + Unrealised Gain/Loss */}
      <View style={styles.metricsRow}>
        <MetricCell
          label="Cost Basis"
          value={
            stats.totalCostBasis > 0
              ? formatMoney(stats.totalCostBasis, baseCurrency)
              : '—'
          }
        />
        <MetricCell
          label="Unrealised P&L"
          value={
            stats.totalCostBasis > 0
              ? `${gainArrow}${formatMoney(stats.totalGainLoss, baseCurrency)}`
              : '—'
          }
          subValue={
            stats.totalCostBasis > 0
              ? `${gainArrow}${stats.totalGainLossPct.toFixed(2)}%`
              : undefined
          }
          valueColor={stats.totalCostBasis > 0 ? gainColor : undefined}
        />
      </View>

      {/* Row 2: Day Change + Holdings Count */}
      <View style={styles.metricsRow}>
        <MetricCell
          label="Day Change"
          value={
            stats.dayChangePnl != null
              ? `${stats.dayChangePnl >= 0 ? '+' : ''}${formatMoney(stats.dayChangePnl, baseCurrency)}`
              : '—'
          }
          subValue={
            stats.dayChangePct != null
              ? `${stats.dayChangePct >= 0 ? '+' : ''}${stats.dayChangePct.toFixed(2)}%`
              : undefined
          }
          valueColor={stats.dayChangePnl != null ? dayColor : undefined}
        />
        <MetricCell
          label="Holdings"
          value={`${stats.holdingCount}`}
          subValue={`${stats.assetClassCount} asset class${stats.assetClassCount !== 1 ? 'es' : ''}`}
        />
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Row 3: Concentration */}
      <Text style={styles.subTitle}>Concentration</Text>
      <View style={styles.metricsRow}>
        <MetricCell
          label="Largest Holding"
          value={`${stats.topHoldingWeight.toFixed(1)}%`}
          subValue={stats.topHoldingName}
        />
        <MetricCell
          label="Top 3 Weight"
          value={`${stats.top3Weight.toFixed(1)}%`}
        />
      </View>

      {/* Diversification bar */}
      <View style={styles.diversificationRow}>
        <View style={styles.diversificationBarBg}>
          <View
            style={[
              styles.diversificationBar,
              {
                width: `${Math.min(100, Math.max(5, (1 - stats.hhi / 10000) * 100))}%` as unknown as number,
                backgroundColor: diversificationColor(stats.diversificationLabel),
              },
            ]}
          />
        </View>
        <Text
          style={[
            styles.diversificationLabel,
            { color: diversificationColor(stats.diversificationLabel) },
          ]}
        >
          {stats.diversificationLabel}
        </Text>
      </View>
    </View>
  );
}

/** Single metric cell inside the stats card. */
function MetricCell({
  label,
  value,
  subValue,
  valueColor,
}: {
  label: string;
  value: string;
  subValue?: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.metricCell}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, valueColor ? { color: valueColor } : undefined]}>
        {value}
      </Text>
      {subValue ? (
        <Text
          style={[styles.metricSub, valueColor ? { color: valueColor } : undefined]}
          numberOfLines={1}
        >
          {subValue}
        </Text>
      ) : null}
    </View>
  );
}

function diversificationColor(label: PortfolioStats['diversificationLabel']): string {
  switch (label) {
    case 'Well diversified':
      return theme.colors.positive;
    case 'Moderately concentrated':
      return '#F59E0B';
    case 'Highly concentrated':
      return theme.colors.negative;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  cardTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  subTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.xs,
  },
  metricCell: {
    flex: 1,
  },
  metricLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: 2,
  },
  metricValue: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  metricSub: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  diversificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: 4,
  },
  diversificationBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
  },
  diversificationBar: {
    height: 6,
    borderRadius: 3,
  },
  diversificationLabel: {
    ...theme.typography.small,
    fontWeight: '500',
  },
});
