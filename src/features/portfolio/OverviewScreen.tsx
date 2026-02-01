import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { LineChart } from 'react-native-chart-kit';
import { usePortfolio } from './usePortfolio';
import {
  holdingsWithValues,
  formatHoldingValueDisplay,
  portfolioChange,
  portfolioTotalRef,
  portfolioTotalBase,
  type HoldingWithValue,
} from './portfolioUtils';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';
import { holdingRepo, eventRepo, portfolioValueSnapshotRepo } from '../../data';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import type { Event, PortfolioValueSnapshot } from '../../data/schemas';
import type { Holding } from '../../data/schemas';

type UpcomingItem = { event: Event; holding: Holding };

/**
 * Overview tab: total value and change at top, 7-day historical value line chart, top holdings, upcoming events, Add Holding CTA.
 * Purpose: "What is my total, how high or low I am, and how it's changed over the last week."
 */
export function OverviewScreen() {
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const { portfolio, holdings, pricesBySymbol, totalBase, loading, error, refresh } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = holdingsWithValues(holdings, pricesBySymbol, baseCurrency);
  const top3 = withValues.slice(0, 3);
  const change = portfolioChange(holdings, pricesBySymbol, baseCurrency);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [historySnapshots, setHistorySnapshots] = useState<PortfolioValueSnapshot[]>([]);

  const totalRef = portfolioTotalRef(holdings, pricesBySymbol, baseCurrency);
  const totalNow = portfolioTotalBase(holdings, pricesBySymbol, baseCurrency);

  const loadHistory = useCallback(async () => {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const snapshots = await portfolioValueSnapshotRepo.getByPortfolioSince(
      db,
      DEFAULT_PORTFOLIO_ID,
      since.toISOString()
    );
    setHistorySnapshots(snapshots);
  }, [db]);

  const performanceChartData = useMemo(() => {
    const points = 7;
    const labels: string[] = [];
    const values: number[] = [];

    if (historySnapshots.length >= 2) {
      for (let i = 0; i < historySnapshots.length; i++) {
        const s = historySnapshots[i];
        values.push(s.valueBase);
        const d = new Date(s.timestamp);
        const isFirst = i === 0;
        const isLast = i === historySnapshots.length - 1;
        labels.push(isFirst ? d.toLocaleDateString(undefined, { weekday: 'short' }) : isLast ? 'Now' : '');
      }
    } else {
      for (let i = 0; i <= points; i++) {
        const t = i / points;
        values.push(totalRef + (totalNow - totalRef) * t);
        const isFirst = i === 0;
        const isLast = i === points;
        if (isFirst) {
          const d = new Date();
          d.setDate(d.getDate() - 7);
          labels.push(d.toLocaleDateString(undefined, { weekday: 'short' }));
        } else labels.push(isLast ? 'Now' : '');
      }
    }
    const data = values.length >= 2 ? values : [totalRef, totalNow];
    return { labels, datasets: [{ data }] };
  }, [historySnapshots, totalRef, totalNow]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadHistory();
    }, [refresh, loadHistory])
  );

  const loadUpcoming = useCallback(async () => {
    const portfolioHoldings = await holdingRepo.getByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
    const all: UpcomingItem[] = [];
    const now = new Date().toISOString();
    for (const holding of portfolioHoldings) {
      const events = await eventRepo.getByHoldingId(db, holding.id);
      for (const event of events) {
        if (event.date >= now) all.push({ event, holding });
      }
    }
    all.sort((a, b) => a.event.date.localeCompare(b.event.date));
    setUpcoming(all.slice(0, 3));
  }, [db]);

  useEffect(() => {
    if (holdings.length > 0) loadUpcoming();
    else setUpcoming([]);
  }, [holdings.length, loadUpcoming]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={refresh} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading && holdings.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

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
        <Text style={styles.emptySubtitle}>
          Add your first asset to see your portfolio value and allocation.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => (navigation as { navigate: (s: string, p?: object) => void }).navigate('Holdings', { screen: 'AddAsset' })}
        >
          <Text style={styles.primaryButtonText}>Add Holding</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const changePct =
    change != null
      ? `${change.pct >= 0 ? '+' : ''}${(change.pct * 100).toFixed(2)}%`
      : null;
  const changeColor = change != null && change.pnl >= 0 ? theme.colors.positive : theme.colors.negative;
  const changeArrow = change != null && change.pnl >= 0 ? '▲' : '▼';
  const changeAmount =
    change != null
      ? formatMoney(change.pnl, baseCurrency)
      : null;
  const formatUpcomingDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const onPressUpcoming = (holdingId: string) => {
    (navigation as { navigate: (s: string, p: object) => void }).navigate('Holdings', {
      screen: 'HoldingDetail',
      params: { holdingId },
    });
  };

  const screenWidth = Dimensions.get('window').width;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={async () => {
              await refresh();
              loadUpcoming();
              loadHistory();
            }}
            tintColor={theme.colors.textPrimary}
          />
        }
    >
      <View style={styles.heroSection}>
        <Text style={styles.totalValue}>{formatMoney(totalBase, baseCurrency)}</Text>
        {changeAmount != null && changePct != null && (
          <View style={styles.changeRow}>
            <Text style={[styles.changeAmount, { color: changeColor }]}>
              {changeAmount}
            </Text>
            <Text style={[styles.changePct, { color: changeColor }]}>
              {changeArrow} {changePct}
            </Text>
          </View>
        )}
      </View>

      {totalRef >= 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.chartLabel}>Last 7 days</Text>
          <LineChart
            data={performanceChartData}
            width={screenWidth - theme.layout.screenPadding * 2}
            height={200}
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: 'transparent',
              backgroundGradientTo: 'transparent',
              decimalPlaces: 0,
              color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.9})`,
              labelColor: () => theme.colors.textSecondary,
              propsForDots: { r: 0 },
              propsForLabels: { fontSize: 10 },
            }}
            bezier
            withInnerLines={false}
            withOuterLines={true}
            fromZero={false}
            style={styles.lineChart}
          />
        </View>
      )}

      {top3.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Holdings</Text>
            <TouchableOpacity
              onPress={() =>
                (navigation as { navigate: (s: string, p?: object) => void }).navigate('Holdings', {
                  screen: 'HoldingsList',
                })
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          {top3.map((item: HoldingWithValue) => (
            <View key={item.holding.id} style={styles.topRow}>
              <Text style={styles.topName} numberOfLines={1}>
                {item.holding.name}
              </Text>
              <Text style={styles.topValue}>
                {formatHoldingValueDisplay(
                  item.holding,
                  item.holding.symbol ? pricesBySymbol.get(item.holding.symbol) ?? null : null,
                  baseCurrency
                )}{' '}
                ({item.weightPercent.toFixed(1)}%)
              </Text>
            </View>
          ))}
        </View>
      )}

      {upcoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upcoming</Text>
          {upcoming.map(({ event, holding }) => (
            <TouchableOpacity
              key={event.id}
              style={styles.upcomingRow}
              onPress={() => onPressUpcoming(holding.id)}
              activeOpacity={0.7}
            >
              <View style={styles.upcomingLeft}>
                <Text style={styles.upcomingName} numberOfLines={1}>{holding.name}</Text>
                <Text style={styles.upcomingKind}>{event.kind.replace(/_/g, ' ')}</Text>
              </View>
              <Text style={styles.upcomingDate}>{formatUpcomingDate(event.date)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.viewAllLink}
            onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Alerts')}
          >
            <Text style={styles.viewAllText}>View all</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.addHoldingButton}
        onPress={() => (navigation as { navigate: (s: string, p?: object) => void }).navigate('Holdings', { screen: 'AddAsset' })}
      >
        <Text style={styles.addHoldingButtonText}>Add Holding</Text>
      </TouchableOpacity>

      <Text style={styles.updated}>
        Prices refresh on pull and when you add or edit holdings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.layout.screenPadding,
  },
  loading: { ...theme.typography.body, color: theme.colors.textSecondary },
  error: { ...theme.typography.body, color: theme.colors.negative, textAlign: 'center' },
  retryButton: { marginTop: theme.spacing.sm, padding: theme.spacing.sm },
  retryText: { ...theme.typography.body, color: theme.colors.textPrimary },
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
  emptySubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  heroSection: {
    marginBottom: theme.spacing.md,
    alignItems: 'center',
  },
  totalValue: {
    ...theme.typography.title,
    fontSize: 36,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  changeAmount: {
    ...theme.typography.bodySemi,
  },
  changePct: {
    ...theme.typography.body,
  },
  chartSection: { marginBottom: theme.spacing.sm },
  chartLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  lineChart: { borderRadius: theme.radius.sm },
  section: { marginBottom: theme.spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
  },
  seeAllText: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  topName: { flex: 1, ...theme.typography.caption, color: theme.colors.textPrimary },
  topValue: { ...theme.typography.captionMedium, color: theme.colors.textSecondary },
  upcomingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  upcomingLeft: { flex: 1 },
  upcomingName: { ...theme.typography.caption, color: theme.colors.textPrimary },
  upcomingKind: { ...theme.typography.small, color: theme.colors.textSecondary },
  upcomingDate: { ...theme.typography.captionMedium, color: theme.colors.textTertiary },
  viewAllLink: { marginTop: theme.spacing.xs, alignSelf: 'flex-start' },
  viewAllText: { ...theme.typography.captionMedium, color: theme.colors.accent },
  primaryButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  addHoldingButton: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  addHoldingButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  updated: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
});
