import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { PieChart } from 'react-native-chart-kit';
import { usePortfolio } from './usePortfolio';
import {
  holdingsWithValues,
  allocationByAssetClass,
  formatHoldingValueDisplay,
  type HoldingWithValue,
} from './portfolioUtils';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';
import { holdingRepo, eventRepo } from '../../data';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import type { Event } from '../../data/schemas';
import type { Holding } from '../../data/schemas';

const CHART_COLORS = [
  '#7C3AED',
  '#22C55E',
  '#A1A1AA',
  '#6B7280',
  '#1F1F26',
  '#EF4444',
];

type UpcomingItem = { event: Event; holding: Holding };

/**
 * Overview tab: total value, allocation, top 3 holdings, next 3 events, Add Holding CTA.
 * Purpose: "What is my total, what is it made of, what needs attention."
 */
export function OverviewScreen() {
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const { portfolio, holdings, pricesBySymbol, totalBase, loading, error, refresh } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = holdingsWithValues(holdings, pricesBySymbol, baseCurrency);
  const allocation = allocationByAssetClass(withValues);
  const top3 = withValues.slice(0, 3);
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);

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

  const pieData = allocation.map((slice, i) => ({
    name: slice.assetClass.replace(/_/g, ' '),
    population: slice.percent,
    color: CHART_COLORS[i % CHART_COLORS.length],
    legendFontColor: theme.colors.textSecondary,
    legendFontSize: 12,
  }));

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

  const asOfLabel = 'As of ' + new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
          onRefresh={() => {
            refresh();
            loadUpcoming();
          }}
          tintColor={theme.colors.textPrimary}
        />
      }
    >
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total portfolio value</Text>
        <Text style={styles.totalValue}>{formatMoney(totalBase, baseCurrency)}</Text>
        <Text style={styles.asOf}>{asOfLabel}</Text>
      </View>

      {allocation.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <PieChart
            data={pieData}
            width={screenWidth - theme.layout.screenPadding * 2}
            height={200}
            chartConfig={{
              color: () => theme.colors.textSecondary,
              labelColor: () => theme.colors.textSecondary,
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            absolute
          />
        </View>
      )}

      {top3.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Holdings</Text>
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
  totalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  totalLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  totalValue: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
  },
  asOf: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  chartSection: { marginBottom: theme.spacing.sm },
  section: { marginBottom: theme.spacing.sm },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
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
