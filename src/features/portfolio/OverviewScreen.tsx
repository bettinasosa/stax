import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Dimensions,
  TouchableOpacity,
  Alert,
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
  attributionFromChange,
  computePortfolioStats,
  totalRealizedGainLoss,
  totalDividendIncome,
  portfolioInceptionReturn,
  type HoldingWithValue,
} from './portfolioUtils';
import { PortfolioStatsCard } from './PortfolioStatsCard';
import { useEntitlements } from '../analysis/useEntitlements';
import { PaywallScreen } from '../analysis/PaywallScreen';
import { exportPortfolioPDF } from '../../services/pdfReport';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';
import { holdingRepo, eventRepo } from '../../data';
import type { Event } from '../../data/schemas';
import type { Holding } from '../../data/schemas';
import type { AssetType } from '../../utils/constants';

/** Display label for each asset type filter. */
const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  stock: 'Stocks',
  etf: 'ETFs',
  crypto: 'Crypto',
  metal: 'Metals',
  commodity: 'Commodities',
  fixed_income: 'Fixed Income',
  real_estate: 'Real Estate',
  cash: 'Cash',
  other: 'Other',
};

type TypeFilter = 'all' | AssetType;

type UpcomingItem = { event: Event; holding: Holding };

/**
 * Overview tab: total value and change at top, 7-day historical value line chart, top holdings, upcoming events, Add Holding CTA.
 * Purpose: "What is my total, how high or low I am, and how it's changed over the last week."
 */
export function OverviewScreen() {
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const {
    portfolio,
    holdings,
    pricesBySymbol,
    loading,
    error,
    refresh,
    activePortfolioId,
    transactions,
    valueHistory,
    fxRates,
  } = usePortfolio();
  const { isPro } = useEntitlements();
  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [showPdfPaywall, setShowPdfPaywall] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [changeMode, setChangeMode] = useState<'day' | 'inception'>('inception');

  /** Unique asset types present in the current portfolio (for filter pills). */
  const availableTypes = useMemo(() => {
    const types = new Set(holdings.map((h) => h.type));
    return (Object.keys(ASSET_TYPE_LABELS) as AssetType[]).filter((t) => types.has(t));
  }, [holdings]);

  /** Holdings filtered by the active type filter. */
  const filteredHoldings = useMemo(
    () => (typeFilter === 'all' ? holdings : holdings.filter((h) => h.type === typeFilter)),
    [holdings, typeFilter]
  );

  const withValues = holdingsWithValues(filteredHoldings, pricesBySymbol, baseCurrency, fxRates);
  const top3 = withValues.slice(0, 3);
  const change = portfolioChange(filteredHoldings, pricesBySymbol, baseCurrency, fxRates);

  const totalRef = portfolioTotalRef(filteredHoldings, pricesBySymbol, baseCurrency, fxRates);
  const totalNow = portfolioTotalBase(filteredHoldings, pricesBySymbol, baseCurrency, fxRates);
  const attribution = useMemo(
    () => attributionFromChange(filteredHoldings, pricesBySymbol, baseCurrency, fxRates),
    [filteredHoldings, pricesBySymbol, baseCurrency, fxRates]
  );
  const topContributors = attribution.rows.filter((r) => r.contributionAbs > 0).slice(0, 3);
  const topDetractors = attribution.rows.filter((r) => r.contributionAbs < 0).slice(0, 3);
  const showAttribution = totalRef > 0 && attribution.rows.some((r) => r.contributionAbs !== 0);

  const portfolioStats = useMemo(
    () => computePortfolioStats(filteredHoldings, pricesBySymbol, baseCurrency, fxRates),
    [filteredHoldings, pricesBySymbol, baseCurrency, fxRates]
  );

  const inceptionReturn = useMemo(
    () => portfolioInceptionReturn(filteredHoldings, pricesBySymbol, baseCurrency, fxRates),
    [filteredHoldings, pricesBySymbol, baseCurrency, fxRates]
  );

  const realizedPnL = useMemo(() => totalRealizedGainLoss(transactions), [transactions]);
  const dividendIncome = useMemo(() => totalDividendIncome(transactions), [transactions]);
  const hasTransactionData = realizedPnL !== 0 || dividendIncome > 0;

  /** Number of days the chart covers (for the label below the chart). */
  const chartDays = useMemo(() => {
    if (valueHistory.length < 2) return 0;
    const first = new Date(valueHistory[0].timestamp);
    const last = new Date(valueHistory[valueHistory.length - 1].timestamp);
    return Math.max(1, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24)));
  }, [valueHistory]);

  const performanceChartData = useMemo(() => {
    const points = 7;
    const labels: string[] = [];
    const values: number[] = [];

    if (valueHistory.length >= 2) {
      for (let i = 0; i < valueHistory.length; i++) {
        const s = valueHistory[i];
        values.push(s.valueBase);
        const isFirst = i === 0;
        const isLast = i === valueHistory.length - 1;
        const d = new Date(s.timestamp);
        labels.push(
          isFirst ? d.toLocaleDateString(undefined, { weekday: 'short' }) : isLast ? 'Now' : ''
        );
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

    // Add Y-axis padding so the line doesn't get clipped at the top/bottom.
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = range * 0.12;
    const paddedMin = min - pad;
    const paddedMax = max + pad;

    return {
      labels,
      datasets: [
        { data, color: () => theme.colors.white, strokeWidth: 3 },
        // Invisible padding dataset to expand Y range
        {
          data: [paddedMin, paddedMax],
          color: () => 'transparent',
          strokeWidth: 0,
          withDots: false,
        },
      ],
    };
  }, [valueHistory, totalRef, totalNow]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const loadUpcoming = useCallback(async () => {
    if (!activePortfolioId) return;
    const portfolioHoldings = await holdingRepo.getByPortfolioId(db, activePortfolioId);
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
  }, [db, activePortfolioId]);

  useEffect(() => {
    if (holdings.length > 0) loadUpcoming();
    else setUpcoming([]);
  }, [holdings.length, loadUpcoming]);

  const handleExportPDF = async () => {
    if (!isPro) {
      (navigation as any).navigate('Paywall', { trigger: 'PDF Report requires Stax Pro' });
      return;
    }
    if (!portfolio) return;
    setExporting(true);
    try {
      await exportPortfolioPDF({
        portfolioName: portfolio.name,
        baseCurrency,
        holdings,
        pricesBySymbol,
        transactions,
        fxRates,
      });
    } catch {
      Alert.alert('Error', 'Failed to generate PDF report.');
    } finally {
      setExporting(false);
    }
  };

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
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={theme.colors.textPrimary}
          />
        }
      >
        <Text style={styles.emptyTitle}>No holdings yet</Text>
        <Text style={styles.emptySubtitle}>
          Add your first asset to see your portfolio value and allocation.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            (navigation as { navigate: (s: string, p?: object) => void }).navigate('Holdings', {
              screen: 'AddAsset',
            })
          }
        >
          <Text style={styles.primaryButtonText}>Add Holding</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // Day change values
  const dayChangePct =
    change != null ? `${change.pct >= 0 ? '+' : ''}${(change.pct * 100).toFixed(2)}%` : null;
  const dayChangeColor =
    change != null && change.pnl >= 0 ? theme.colors.positive : theme.colors.negative;
  const dayChangeArrow = change != null && change.pnl >= 0 ? '▲' : '▼';
  const dayChangeAmount = change != null ? formatMoney(change.pnl, baseCurrency) : null;

  // Since-inception values
  const inceptionPct =
    inceptionReturn != null
      ? `${inceptionReturn.returnPct >= 0 ? '+' : ''}${inceptionReturn.returnPct.toFixed(2)}%`
      : null;
  const inceptionColor =
    inceptionReturn != null && inceptionReturn.gainLoss >= 0
      ? theme.colors.positive
      : theme.colors.negative;
  const inceptionArrow =
    inceptionReturn != null && inceptionReturn.gainLoss >= 0 ? '▲' : '▼';
  const inceptionAmount =
    inceptionReturn != null ? formatMoney(inceptionReturn.gainLoss, baseCurrency) : null;

  // Active change display (based on toggle)
  const activeChangePct = changeMode === 'inception' ? inceptionPct : dayChangePct;
  const activeChangeColor = changeMode === 'inception' ? inceptionColor : dayChangeColor;
  const activeChangeArrow = changeMode === 'inception' ? inceptionArrow : dayChangeArrow;
  const activeChangeAmount = changeMode === 'inception' ? inceptionAmount : dayChangeAmount;
  const changeModeLabel = changeMode === 'inception' ? 'Since inception' : 'Day change';
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
          onRefresh={refresh}
          tintColor={theme.colors.textPrimary}
        />
      }
    >
      {/* ── Type filter pills ── */}
      {availableTypes.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScroll}
        >
          <TouchableOpacity
            style={[styles.filterPill, typeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setTypeFilter('all')}
          >
            <Text
              style={[styles.filterPillText, typeFilter === 'all' && styles.filterPillTextActive]}
            >
              All
            </Text>
          </TouchableOpacity>
          {availableTypes.map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.filterPill, typeFilter === t && styles.filterPillActive]}
              onPress={() => setTypeFilter(t)}
            >
              <Text
                style={[styles.filterPillText, typeFilter === t && styles.filterPillTextActive]}
              >
                {ASSET_TYPE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.heroSection}>
        <Text style={styles.totalValue}>{formatMoney(totalNow, baseCurrency)}</Text>
        {activeChangeAmount != null && activeChangePct != null && (
          <View style={styles.changeRow}>
            <Text style={[styles.changeAmount, { color: activeChangeColor }]}>
              {activeChangeAmount}
            </Text>
            <Text style={[styles.changePct, { color: activeChangeColor }]}>
              {activeChangeArrow} {activeChangePct}
            </Text>
          </View>
        )}
        {/* Day / Inception toggle */}
        {(dayChangeAmount != null || inceptionAmount != null) && (
          <View style={styles.changeModeRow}>
            <TouchableOpacity
              style={[styles.changeModePill, changeMode === 'day' && styles.changeModePillActive]}
              onPress={() => setChangeMode('day')}
            >
              <Text
                style={[
                  styles.changeModePillText,
                  changeMode === 'day' && styles.changeModePillTextActive,
                ]}
              >
                Day
              </Text>
            </TouchableOpacity>
            {inceptionReturn != null && (
              <TouchableOpacity
                style={[
                  styles.changeModePill,
                  changeMode === 'inception' && styles.changeModePillActive,
                ]}
                onPress={() => setChangeMode('inception')}
              >
                <Text
                  style={[
                    styles.changeModePillText,
                    changeMode === 'inception' && styles.changeModePillTextActive,
                  ]}
                >
                  Since inception
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {totalRef >= 0 && typeFilter === 'all' && (
        <View style={styles.chartSection}>
          <LineChart
            data={performanceChartData}
            width={screenWidth}
            height={200}
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: 'transparent',
              backgroundGradientTo: 'transparent',
              decimalPlaces: 0,
              color: () => theme.colors.white,
              strokeWidth: 3,
              linejoinType: 'round',
              labelColor: () => theme.colors.textSecondary,
              propsForDots: { r: 0 },
              propsForLabels: { fontSize: 10 },
            }}
            withShadow={false}
            withInnerLines={false}
            withOuterLines={false}
            withVerticalLabels={false}
            withHorizontalLabels={false}
            fromZero={false}
            style={styles.lineChart}
          />
          <Text style={styles.chartCaption}>
            {chartDays > 0
              ? `Showing ${chartDays} day${chartDays === 1 ? '' : 's'} of portfolio history`
              : 'Estimated trend — more data points collected on each refresh'}
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.addHoldingButton}
        onPress={() =>
          (navigation as { navigate: (s: string, p?: object) => void }).navigate('Holdings', {
            screen: 'AddAsset',
          })
        }
      >
        <Text style={styles.addHoldingButtonText}>Add Holding</Text>
      </TouchableOpacity>

      {/* Portfolio Summary Stats */}
      {filteredHoldings.length > 0 && (
        <PortfolioStatsCard stats={portfolioStats} baseCurrency={baseCurrency} />
      )}

      {hasTransactionData && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Income & Realized P&L</Text>
          {realizedPnL !== 0 && (
            <View style={styles.topRow}>
              <Text style={styles.topName}>Realized P&L</Text>
              <Text
                style={[
                  styles.topValue,
                  realizedPnL >= 0
                    ? { color: theme.colors.positive }
                    : { color: theme.colors.negative },
                ]}
              >
                {realizedPnL >= 0 ? '+' : ''}
                {formatMoney(realizedPnL, baseCurrency)}
              </Text>
            </View>
          )}
          {dividendIncome > 0 && (
            <View style={styles.topRow}>
              <Text style={styles.topName}>Dividend income</Text>
              <Text style={[styles.topValue, { color: theme.colors.positive }]}>
                +{formatMoney(dividendIncome, baseCurrency)}
              </Text>
            </View>
          )}
        </View>
      )}

      {showAttribution && (topContributors.length > 0 || topDetractors.length > 0) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance attribution</Text>
          <Text style={styles.attributionSubtitle}>
            Contribution to portfolio change (vs previous close / 24h)
          </Text>
          {topContributors.length > 0 && (
            <View style={styles.attributionBlock}>
              <Text style={styles.attributionLabel}>Top contributors</Text>
              {topContributors.map((r) => (
                <View key={r.holdingId} style={styles.attributionRow}>
                  <Text style={styles.attributionName} numberOfLines={1}>
                    {r.holdingName}
                  </Text>
                  <Text style={styles.attributionPositive}>
                    +{formatMoney(r.contributionAbs, baseCurrency)}
                    {r.returnPct != null
                      ? ` (${r.returnPct >= 0 ? '+' : ''}${r.returnPct.toFixed(2)}%)`
                      : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {topDetractors.length > 0 && (
            <View style={styles.attributionBlock}>
              <Text style={styles.attributionLabel}>Top detractors</Text>
              {topDetractors.map((r) => (
                <View key={r.holdingId} style={styles.attributionRow}>
                  <Text style={styles.attributionName} numberOfLines={1}>
                    {r.holdingName}
                  </Text>
                  <Text style={styles.attributionNegative}>
                    {formatMoney(r.contributionAbs, baseCurrency)}
                    {r.returnPct != null ? ` (${r.returnPct.toFixed(2)}%)` : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
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
                  item.holding.symbol ? (pricesBySymbol.get(item.holding.symbol) ?? null) : null,
                  baseCurrency,
                  fxRates
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
                <Text style={styles.upcomingName} numberOfLines={1}>
                  {holding.name}
                </Text>
                <Text style={styles.upcomingKind}>{event.kind.replace(/_/g, ' ')}</Text>
              </View>
              <Text style={styles.upcomingDate}>{formatUpcomingDate(event.date)}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.viewAllLink}
            onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Settings')}
          >
            <Text style={styles.viewAllText}>View all in Settings</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Export PDF (Pro) */}
      <TouchableOpacity
        style={[styles.exportPdfButton, exporting && styles.buttonDisabled]}
        onPress={handleExportPDF}
        disabled={exporting}
      >
        <Text style={styles.exportPdfText}>
          {exporting ? 'Generating...' : 'Export PDF Report'}
          {!isPro ? ' (Pro)' : ''}
        </Text>
      </TouchableOpacity>

      <Text style={styles.updated}>Prices refresh on pull and when you add or edit holdings.</Text>
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
  changeModeRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  changeModePill: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  changeModePillActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  changeModePillText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  changeModePillTextActive: {
    ...theme.typography.small,
    color: theme.colors.background,
    fontWeight: '600',
  },
  chartSection: {
    marginBottom: theme.spacing.sm,
    marginHorizontal: -theme.layout.screenPadding,
  },
  filterScroll: {
    marginBottom: theme.spacing.sm,
    flexGrow: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    paddingHorizontal: 2,
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  filterPillActive: {
    backgroundColor: theme.colors.accent,
  },
  filterPillText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
  },
  filterPillTextActive: {
    color: theme.colors.white,
  },
  lineChart: { borderRadius: 0, paddingRight: 0, paddingLeft: 0 },
  chartCaption: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.layout.screenPadding,
  },
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
  attributionSubtitle: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  attributionBlock: {
    marginBottom: theme.spacing.sm,
  },
  attributionLabel: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  attributionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.xs,
  },
  attributionName: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  attributionPositive: {
    ...theme.typography.captionMedium,
    color: theme.colors.positive,
  },
  attributionNegative: {
    ...theme.typography.captionMedium,
    color: theme.colors.negative,
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
  exportPdfButton: {
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  exportPdfText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  buttonDisabled: { opacity: 0.6 },
});
