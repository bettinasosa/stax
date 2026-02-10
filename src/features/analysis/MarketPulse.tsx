import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useRecommendationTrends, type SentimentSummary } from '../charts/hooks/useRecommendationTrends';
import { usePriceTargets, type PriceTargetSummary } from '../charts/hooks/usePriceTargets';
import { useInsiderSentiment, type InsiderSummary } from '../charts/hooks/useInsiderSentiment';
import type { Holding } from '../../data/schemas';
import { theme } from '../../utils/theme';

interface Props {
  holdings: Holding[];
}

const CONSENSUS_COLORS: Record<string, string> = {
  'Strong Buy': '#22C55E',
  Buy: '#4ADE80',
  Hold: '#F59E0B',
  Sell: '#F87171',
  'Strong Sell': '#EF4444',
};

type PulseTab = 'ratings' | 'targets' | 'insiders';

const PULSE_TABS: { key: PulseTab; label: string }[] = [
  { key: 'ratings', label: 'Analyst Ratings' },
  { key: 'targets', label: 'Price Targets' },
  { key: 'insiders', label: 'Insider Activity' },
];

/**
 * Market Pulse: analyst sentiment, price targets, and insider activity
 * for all stock/ETF holdings.
 */
export function MarketPulse({ holdings }: Props) {
  const { sentiments, sentimentLoading } = useRecommendationTrends(holdings);
  const { targets, priceTargetsLoading } = usePriceTargets(holdings);
  const { insiders, insiderLoading } = useInsiderSentiment(holdings);
  const [activeTab, setActiveTab] = useState<PulseTab>('ratings');

  const isLoading = sentimentLoading || priceTargetsLoading || insiderLoading;
  const hasStocks = holdings.some((h) => h.type === 'stock' || h.type === 'etf');

  if (!hasStocks) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No analyst data</Text>
        <Text style={styles.emptyText}>
          Add stocks or ETFs to see analyst recommendations, price targets, and insider activity.
        </Text>
      </View>
    );
  }

  if (isLoading && sentiments.length === 0 && targets.length === 0 && insiders.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.textPrimary} />
        <Text style={styles.loadingText}>Loading market data...</Text>
      </View>
    );
  }

  // Aggregate summary
  const totalBullish = sentiments.reduce(
    (s, x) => s + x.latest.strongBuy + x.latest.buy,
    0
  );
  const totalBearish = sentiments.reduce(
    (s, x) => s + x.latest.sell + x.latest.strongSell,
    0
  );
  const totalHold = sentiments.reduce((s, x) => s + x.latest.hold, 0);
  const totalAll = totalBullish + totalHold + totalBearish;
  const bullPct = totalAll > 0 ? (totalBullish / totalAll) * 100 : 0;
  const holdPct = totalAll > 0 ? (totalHold / totalAll) * 100 : 0;
  const bearPct = totalAll > 0 ? (totalBearish / totalAll) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Aggregate Sentiment Bar -- always visible */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Overall Analyst Sentiment</Text>
        <Text style={styles.summarySubtitle}>
          {totalAll} ratings across {sentiments.length} holdings
        </Text>
        <View style={styles.sentimentBar}>
          {bullPct > 0 && (
            <View style={[styles.sentimentSegment, { flex: bullPct, backgroundColor: '#22C55E' }]} />
          )}
          {holdPct > 0 && (
            <View style={[styles.sentimentSegment, { flex: holdPct, backgroundColor: '#F59E0B' }]} />
          )}
          {bearPct > 0 && (
            <View style={[styles.sentimentSegment, { flex: bearPct, backgroundColor: '#EF4444' }]} />
          )}
        </View>
        <View style={styles.sentimentLabels}>
          <View style={styles.sentimentLabelItem}>
            <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
            <Text style={styles.sentimentLabelText}>Bullish {bullPct.toFixed(0)}%</Text>
          </View>
          <View style={styles.sentimentLabelItem}>
            <View style={[styles.dot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.sentimentLabelText}>Neutral {holdPct.toFixed(0)}%</Text>
          </View>
          <View style={styles.sentimentLabelItem}>
            <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
            <Text style={styles.sentimentLabelText}>Bearish {bearPct.toFixed(0)}%</Text>
          </View>
        </View>
      </View>

      {/* Sub-tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
        <View style={styles.tabRow}>
          {PULSE_TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.pulseTab, activeTab === t.key && styles.pulseTabActive]}
              onPress={() => setActiveTab(t.key)}
            >
              <Text style={[styles.pulseTabText, activeTab === t.key && styles.pulseTabTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Analyst Ratings */}
      {activeTab === 'ratings' && (
        sentiments.length > 0 ? (
          sentiments.map((s) => (
            <SentimentCard key={s.holdingId} data={s} />
          ))
        ) : (
          <Text style={styles.noData}>No analyst ratings available yet.</Text>
        )
      )}

      {/* Price Targets */}
      {activeTab === 'targets' && (
        targets.length > 0 ? (
          targets.map((t) => (
            <PriceTargetCard key={t.holdingId} data={t} />
          ))
        ) : (
          priceTargetsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.colors.textPrimary} size="small" />
            </View>
          ) : (
            <Text style={styles.noData}>No price target data available yet.</Text>
          )
        )
      )}

      {/* Insider Activity */}
      {activeTab === 'insiders' && (
        insiders.length > 0 ? (
          insiders.map((ins) => (
            <InsiderCard key={ins.holdingId} data={ins} />
          ))
        ) : (
          insiderLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.colors.textPrimary} size="small" />
            </View>
          ) : (
            <Text style={styles.noData}>No insider activity data available yet.</Text>
          )
        )
      )}
    </View>
  );
}

function SentimentCard({ data }: { data: SentimentSummary }) {
  const { latest, consensus, totalAnalysts, bullishPct } = data;
  const bearishPct =
    totalAnalysts > 0
      ? ((latest.sell + latest.strongSell) / totalAnalysts) * 100
      : 0;
  const holdPct = totalAnalysts > 0 ? (latest.hold / totalAnalysts) * 100 : 0;
  const consensusColor = CONSENSUS_COLORS[consensus] ?? theme.colors.textSecondary;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardSymbol}>{data.symbol}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {data.holdingName}
          </Text>
        </View>
        <View style={[styles.consensusBadge, { backgroundColor: consensusColor + '20' }]}>
          <Text style={[styles.consensusText, { color: consensusColor }]}>{consensus}</Text>
        </View>
      </View>

      {/* Mini sentiment bar */}
      <View style={styles.miniBar}>
        {bullishPct > 0 && (
          <View style={[styles.miniSegment, { flex: bullishPct, backgroundColor: '#22C55E' }]} />
        )}
        {holdPct > 0 && (
          <View style={[styles.miniSegment, { flex: holdPct, backgroundColor: '#F59E0B' }]} />
        )}
        {bearishPct > 0 && (
          <View style={[styles.miniSegment, { flex: bearishPct, backgroundColor: '#EF4444' }]} />
        )}
      </View>

      {/* Breakdown row */}
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownItem}>
          <Text style={{ color: '#22C55E' }}>
            {latest.strongBuy + latest.buy}
          </Text>
          {' Buy'}
        </Text>
        <Text style={styles.breakdownItem}>
          <Text style={{ color: '#F59E0B' }}>{latest.hold}</Text>
          {' Hold'}
        </Text>
        <Text style={styles.breakdownItem}>
          <Text style={{ color: '#EF4444' }}>
            {latest.sell + latest.strongSell}
          </Text>
          {' Sell'}
        </Text>
        <Text style={styles.analystCount}>{totalAnalysts} analysts</Text>
      </View>
    </View>
  );
}

function PriceTargetCard({ data }: { data: PriceTargetSummary }) {
  const { target } = data;
  const range = target.targetHigh - target.targetLow;
  const medianPos =
    range > 0 ? ((target.targetMedian - target.targetLow) / range) * 100 : 50;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardSymbol}>{data.symbol}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {data.holdingName}
          </Text>
        </View>
        <View style={styles.targetMedianBadge}>
          <Text style={styles.targetMedianText}>
            ${target.targetMedian.toFixed(0)}
          </Text>
        </View>
      </View>

      {/* Range bar */}
      <View style={styles.targetRangeBar}>
        <View
          style={[
            styles.targetMedianDot,
            { left: `${Math.min(Math.max(medianPos, 5), 95)}%` },
          ]}
        />
      </View>
      <View style={styles.targetRangeLabels}>
        <Text style={styles.targetRangeLow}>${target.targetLow.toFixed(0)}</Text>
        <Text style={styles.targetRangeLabel}>Low → High</Text>
        <Text style={styles.targetRangeHigh}>${target.targetHigh.toFixed(0)}</Text>
      </View>
    </View>
  );
}

const INSIDER_SIGNAL_COLORS: Record<string, string> = {
  'Net Buying': '#22C55E',
  'Net Selling': '#EF4444',
  Neutral: '#F59E0B',
};

function InsiderCard({ data }: { data: InsiderSummary }) {
  const signalColor = INSIDER_SIGNAL_COLORS[data.signal] ?? theme.colors.textSecondary;
  const msprDisplay =
    data.latestMspr > 0
      ? `+${data.latestMspr.toFixed(1)}%`
      : `${data.latestMspr.toFixed(1)}%`;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardSymbol}>{data.symbol}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {data.holdingName}
          </Text>
        </View>
        <View style={[styles.consensusBadge, { backgroundColor: signalColor + '20' }]}>
          <Text style={[styles.consensusText, { color: signalColor }]}>{data.signal}</Text>
        </View>
      </View>
      <View style={styles.insiderRow}>
        <Text style={styles.insiderLabel}>MSPR (Monthly Share Purchase Ratio)</Text>
        <Text style={[styles.insiderValue, { color: signalColor }]}>{msprDisplay}</Text>
      </View>
      <Text style={styles.insiderHint}>
        {data.signal === 'Net Buying'
          ? 'Insiders are accumulating shares — often a bullish signal.'
          : data.signal === 'Net Selling'
            ? 'Insiders are reducing positions — could signal caution.'
            : 'Balanced insider activity with no strong directional signal.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: theme.spacing.xs },
  centered: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  loadingText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
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

  // Summary card
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
  },
  summaryTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  summarySubtitle: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.sm,
  },
  sentimentBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: theme.colors.border,
  },
  sentimentSegment: {
    height: 10,
  },
  sentimentLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  sentimentLabelItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  sentimentLabelText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },

  // Per-holding card
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  cardLeft: {
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  cardSymbol: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  cardName: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  consensusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  consensusText: {
    ...theme.typography.small,
    fontWeight: '600',
  },
  miniBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.xs,
  },
  miniSegment: {
    height: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  breakdownItem: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  analystCount: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginLeft: 'auto',
  },

  // Sub-tabs
  tabScroll: {
    flexGrow: 0,
    marginBottom: theme.spacing.xs,
  },
  tabRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  pulseTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pulseTabActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  pulseTabText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  pulseTabTextActive: {
    ...theme.typography.small,
    color: theme.colors.background,
    fontWeight: '600',
  },
  noData: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },

  // Price target card
  targetMedianBadge: {
    backgroundColor: '#3B82F620',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  targetMedianText: {
    ...theme.typography.small,
    fontWeight: '600',
    color: '#3B82F6',
  },
  targetRangeBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
    position: 'relative',
  },
  targetMedianDot: {
    position: 'absolute',
    top: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
    marginLeft: -6,
  },
  targetRangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetRangeLow: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  targetRangeLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  targetRangeHigh: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },

  // Insider card
  insiderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  insiderLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    flex: 1,
  },
  insiderValue: {
    ...theme.typography.captionMedium,
  },
  insiderHint: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    fontStyle: 'italic',
  },
});
