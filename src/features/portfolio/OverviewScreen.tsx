import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
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

const CHART_COLORS = [
  '#7C3AED',
  '#22C55E',
  '#A1A1AA',
  '#6B7280',
  '#1F1F26',
  '#EF4444',
];

/**
 * Overview tab: total value, allocation chart, top 5, last updated, pull-to-refresh.
 */
export function OverviewScreen() {
  const { portfolio, holdings, pricesBySymbol, totalBase, loading, error, refresh } = usePortfolio();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = holdingsWithValues(holdings, pricesBySymbol, baseCurrency);
  const allocation = allocationByAssetClass(withValues);
  const top5 = withValues.slice(0, 5);

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
          <RefreshControl refreshing={loading} onRefresh={refresh} />
        }
      >
        <Text style={styles.emptyTitle}>No holdings yet</Text>
        <Text style={styles.emptySubtitle}>Add your first asset to see your portfolio value and allocation.</Text>
      </ScrollView>
    );
  }

  const screenWidth = Dimensions.get('window').width;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textPrimary} />
      }
    >
      <View style={styles.totalCard}>
        <Text style={styles.totalLabel}>Total portfolio value</Text>
        <Text style={styles.totalValue}>{formatMoney(totalBase, baseCurrency)}</Text>
      </View>

      {allocation.length > 0 && (
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>Allocation by asset class</Text>
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

      {top5.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top 5 positions</Text>
          {top5.map((item: HoldingWithValue) => (
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
  updated: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
});
