import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '../../utils/theme';
import { useIndicesSnapshot } from './hooks/useIndicesSnapshot';

interface IndicesAtAGlanceProps {
  /** Portfolio daily % change (e.g. from portfolioChange().pct * 100). Null if not available. */
  portfolioChangePct: number | null;
}

function formatChange(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function Row({
  label,
  changePercent,
  color,
  isPortfolio,
}: {
  label: string;
  changePercent: number | null;
  color: string;
  isPortfolio?: boolean;
}) {
  const isUp = changePercent != null && changePercent > 0;
  const isDown = changePercent != null && changePercent < 0;
  const sentiment = isUp ? 'Bull' : isDown ? 'Bear' : '—';

  return (
    <View style={styles.row}>
      <View style={styles.labelBlock}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, isPortfolio && styles.portfolioLabel]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.pct,
          isUp && styles.pctUp,
          isDown && styles.pctDown,
        ]}
      >
        {formatChange(changePercent)}
      </Text>
      <View style={styles.sentimentBlock}>
        <Text style={[styles.sentiment, isUp && styles.sentimentBull, isDown && styles.sentimentBear]}>
          {sentiment}
        </Text>
      </View>
    </View>
  );
}

/**
 * Renders a compact "Indices at a glance" card: S&P 500, NASDAQ, Bonds, Gold
 * with today's change % and bull/bear, plus portfolio vs them.
 * Data comes from Supabase price cache only (no candle API calls).
 */
export function IndicesAtAGlance({ portfolioChangePct }: IndicesAtAGlanceProps) {
  const { indices, loading } = useIndicesSnapshot();

  if (loading) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Market at a glance</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
          <Text style={styles.loadingText}>Loading indices…</Text>
        </View>
      </View>
    );
  }

  const hasAny = indices.some((i) => i.changePercent != null) || portfolioChangePct != null;
  if (!hasAny) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Market at a glance</Text>
      <Text style={styles.subtitle}>Today vs your portfolio</Text>
      {indices.map((idx) => (
        <Row
          key={idx.symbol}
          label={idx.label}
          changePercent={idx.changePercent}
          color={idx.color}
        />
      ))}
      <View style={styles.divider} />
      <Row
        label="Your portfolio"
        changePercent={portfolioChangePct != null ? portfolioChangePct * 100 : null}
        color={theme.colors.white}
        isPortfolio
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  subtitle: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  loadingText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  labelBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  label: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  portfolioLabel: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  pct: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginHorizontal: theme.spacing.xs,
    minWidth: 56,
    textAlign: 'right',
  },
  pctUp: {
    color: theme.colors.positive,
  },
  pctDown: {
    color: theme.colors.negative,
  },
  sentimentBlock: {
    minWidth: 36,
    alignItems: 'flex-end',
  },
  sentiment: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  sentimentBull: {
    color: theme.colors.positive,
  },
  sentimentBear: {
    color: theme.colors.negative,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
});
