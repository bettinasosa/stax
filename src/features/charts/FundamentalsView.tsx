import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import type { Holding } from '../../data/schemas';
import { useEarningsData } from './hooks/useEarningsData';
import { useFinancialMetrics } from './hooks/useFinancialMetrics';
import { useCompanyProfile } from './hooks/useCompanyProfile';
import { theme } from '../../utils/theme';

type EpsPeriod = 'quarterly' | 'annual';

interface Props {
  holdings: Holding[];
}

const screenWidth = Dimensions.get('window').width;

export function FundamentalsView({ holdings }: Props) {
  const stockHoldings = useMemo(
    () =>
      holdings.filter(
        (h) =>
          (h.type === 'stock' || h.type === 'etf') && h.symbol != null
      ),
    [holdings]
  );

  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(
    stockHoldings[0]?.symbol ?? null
  );
  const [epsPeriod, setEpsPeriod] = useState<EpsPeriod>('quarterly');

  const [showDeepDive, setShowDeepDive] = useState(false);

  const { earnings, loading: earningsLoading } = useEarningsData(selectedSymbol);
  const { metrics, loading: metricsLoading } = useFinancialMetrics(selectedSymbol);
  const { profile } = useCompanyProfile(selectedSymbol);

  // EPS chart data
  const epsChartData = useMemo(() => {
    if (earnings.length === 0) return null;

    let items = [...earnings].reverse(); // oldest first

    if (epsPeriod === 'annual') {
      // Group by year, average actuals
      const byYear = new Map<number, { actual: number[]; estimate: number[] }>();
      for (const e of items) {
        if (!byYear.has(e.year)) byYear.set(e.year, { actual: [], estimate: [] });
        const y = byYear.get(e.year)!;
        if (e.actual != null) y.actual.push(e.actual);
        if (e.estimate != null) y.estimate.push(e.estimate);
      }
      const years = Array.from(byYear.keys()).sort();
      const labels = years.map((y) => String(y));
      const data = years.map((y) => {
        const vals = byYear.get(y)!.actual.filter((v) => Number.isFinite(v));
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : 0;
      });
      return { labels: labels.slice(-6), data: data.slice(-6) };
    }

    // Quarterly: last 8 quarters
    items = items.slice(-8);
    const labels = items.map((e) => `Q${e.quarter} '${String(e.year).slice(2)}`);
    const data = items.map((e) => e.actual ?? 0);
    return { labels, data };
  }, [earnings, epsPeriod]);

  // EPS surprise data for display below chart
  const epsSurpriseData = useMemo(() => {
    if (earnings.length === 0) return [];
    let items = [...earnings].reverse();
    if (epsPeriod === 'quarterly') {
      items = items.slice(-8);
    }
    return items.map((e) => ({
      period: epsPeriod === 'quarterly' ? `Q${e.quarter} '${String(e.year).slice(2)}` : String(e.year),
      actual: e.actual,
      estimate: e.estimate,
      surprise: e.surprisePercent,
    }));
  }, [earnings, epsPeriod]);

  // Key financial metrics to display
  const metricCards = useMemo(() => {
    if (!metrics?.metric) return [];
    const m = metrics.metric;
    return [
      { label: 'P/E Ratio', value: formatMetric(m.peBasicExclExtraTTM, 1) },
      { label: 'EPS (TTM)', value: formatMetric(m.epsBasicExclExtraItemsTTM, 2, '$') },
      { label: 'Revenue/Share', value: formatMetric(m.revenuePerShareTTM, 2, '$') },
      { label: 'Price/Book', value: formatMetric(m.pbAnnual, 2) },
      { label: 'Dividend Yield', value: formatMetric(m.dividendYieldIndicatedAnnual, 2, '', '%') },
      { label: 'ROE', value: formatMetric(m.roeTTM, 1, '', '%') },
      { label: 'Debt/Equity', value: formatMetric(m['totalDebt/totalEquityQuarterly'], 2) },
      { label: 'Net Margin', value: formatMetric(m.netProfitMarginTTM, 1, '', '%') },
      { label: '52W High', value: formatMetric(m['52WeekHigh'], 2, '$') },
      { label: '52W Low', value: formatMetric(m['52WeekLow'], 2, '$') },
      { label: 'Beta', value: formatMetric(m.beta, 2) },
      { label: 'Market Cap', value: formatLargeNumber(m.marketCapitalization) },
    ].filter((c) => c.value !== '—');
  }, [metrics]);

  if (stockHoldings.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>No stock holdings</Text>
        <Text style={styles.emptyText}>
          Add stocks or ETFs to your portfolio to see earnings and financial metrics.
        </Text>
      </View>
    );
  }

  const loading = earningsLoading || metricsLoading;

  return (
    <View style={styles.container}>
      {/* Stock picker */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pickerScroll}
      >
        <View style={styles.pickerRow}>
          {stockHoldings.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[
                styles.pickerChip,
                selectedSymbol === h.symbol && styles.pickerChipActive,
              ]}
              onPress={() => setSelectedSymbol(h.symbol!)}
            >
              <Text
                style={[
                  styles.pickerText,
                  selectedSymbol === h.symbol && styles.pickerTextActive,
                ]}
                numberOfLines={1}
              >
                {h.symbol}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.textPrimary} />
        </View>
      ) : (
        <>
          {/* EPS Section */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Earnings Per Share</Text>

            {/* Annual / Quarterly toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, epsPeriod === 'quarterly' && styles.toggleBtnActive]}
                onPress={() => setEpsPeriod('quarterly')}
              >
                <Text style={[styles.toggleText, epsPeriod === 'quarterly' && styles.toggleTextActive]}>
                  Quarterly
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, epsPeriod === 'annual' && styles.toggleBtnActive]}
                onPress={() => setEpsPeriod('annual')}
              >
                <Text style={[styles.toggleText, epsPeriod === 'annual' && styles.toggleTextActive]}>
                  Annual
                </Text>
              </TouchableOpacity>
            </View>

            {epsChartData && epsChartData.data.length > 0 ? (
              <>
                <BarChart
                  data={{
                    labels: epsChartData.labels,
                    datasets: [{ data: epsChartData.data }],
                  }}
                  width={screenWidth - 64}
                  height={180}
                  yAxisLabel="$"
                  yAxisSuffix=""
                  chartConfig={{
                    backgroundColor: 'transparent',
                    backgroundGradientFrom: 'transparent',
                    backgroundGradientTo: 'transparent',
                    decimalPlaces: 2,
                    color: () => theme.colors.white,
                    labelColor: () => theme.colors.textSecondary,
                    propsForLabels: { fontSize: 11 },
                    barPercentage: 0.6,
                  }}
                  fromZero
                  withInnerLines={false}
                  style={styles.chart}
                />

                {/* Surprise table */}
                {epsPeriod === 'quarterly' && epsSurpriseData.length > 0 && (
                  <View style={styles.surpriseTable}>
                    <View style={styles.surpriseHeader}>
                      <Text style={[styles.surpriseCell, styles.surprisePeriod]}>Period</Text>
                      <Text style={styles.surpriseCell}>Actual</Text>
                      <Text style={styles.surpriseCell}>Est.</Text>
                      <Text style={[styles.surpriseCell, { textAlign: 'right' }]}>Surprise</Text>
                    </View>
                    {epsSurpriseData.slice(-8).map((row) => (
                      <View key={row.period} style={styles.surpriseRow}>
                        <Text style={[styles.surpriseCell, styles.surprisePeriod]}>
                          {row.period}
                        </Text>
                        <Text style={styles.surpriseCell}>
                          {row.actual != null ? `$${row.actual.toFixed(2)}` : '—'}
                        </Text>
                        <Text style={styles.surpriseCell}>
                          {row.estimate != null ? `$${row.estimate.toFixed(2)}` : '—'}
                        </Text>
                        <Text
                          style={[
                            styles.surpriseCell,
                            {
                              textAlign: 'right',
                              color:
                                row.surprise != null && row.surprise >= 0
                                  ? theme.colors.positive
                                  : theme.colors.negative,
                            },
                          ]}
                        >
                          {row.surprise != null ? `${row.surprise >= 0 ? '+' : ''}${row.surprise.toFixed(1)}%` : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.noDataText}>No earnings data available for {selectedSymbol}</Text>
            )}
          </View>

          {/* Key Metrics Section */}
          {metricCards.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Financial Performance</Text>
              <View style={styles.metricsGrid}>
                {metricCards.map((c) => (
                  <View key={c.label} style={styles.metricCard}>
                    <Text style={styles.metricLabel}>{c.label}</Text>
                    <Text style={styles.metricValue}>{c.value}</Text>
                  </View>
                ))}
              </View>

              {/* Deep Dive toggle */}
              <TouchableOpacity
                style={styles.deepDiveBtn}
                onPress={() => setShowDeepDive(!showDeepDive)}
              >
                <Text style={styles.deepDiveBtnText}>
                  {showDeepDive ? 'Hide Insights' : 'More Insights'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Deep Dive: Quick health check, metric explanations + Company Profile */}
          {showDeepDive && (
            <>
              {/* Company Profile */}
              {profile && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Company Profile</Text>
                  <View style={styles.profileGrid}>
                    {profile.name ? <ProfileRow label="Name" value={profile.name} /> : null}
                    {profile.finnhubIndustry ? <ProfileRow label="Industry" value={profile.finnhubIndustry} /> : null}
                    {profile.country ? <ProfileRow label="Country" value={profile.country} /> : null}
                    {profile.exchange ? <ProfileRow label="Exchange" value={profile.exchange} /> : null}
                    {profile.ipo ? <ProfileRow label="IPO Date" value={profile.ipo} /> : null}
                    {profile.weburl ? <ProfileRow label="Website" value={profile.weburl} /> : null}
                  </View>
                </View>
              )}

              {/* Quick Health Check */}
              {metrics?.metric && (
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>Quick Health Check</Text>
                  {generateHealthChecks(metrics.metric).map((check, i) => (
                    <View key={i} style={styles.healthRow}>
                      <View style={[styles.healthDot, { backgroundColor: check.color }]} />
                      <View style={styles.healthContent}>
                        <Text style={styles.healthTitle}>{check.title}</Text>
                        <Text style={styles.healthBody}>{check.body}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Metric Explanations */}
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>What These Metrics Mean</Text>
                {METRIC_EXPLANATIONS.filter((m) =>
                  metricCards.some((c) => c.label === m.label)
                ).map((m) => (
                  <View key={m.label} style={styles.explanationRow}>
                    <Text style={styles.explanationLabel}>{m.label}</Text>
                    <Text style={styles.explanationText}>{m.explanation}</Text>
                    {m.goodRange && (
                      <Text style={styles.explanationRange}>
                        Typical healthy range: {m.goodRange}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

/** Company profile row. */
function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={styles.profileValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Metric explanations
// ---------------------------------------------------------------------------

const METRIC_EXPLANATIONS: { label: string; explanation: string; goodRange?: string }[] = [
  {
    label: 'P/E Ratio',
    explanation:
      'Price-to-Earnings ratio measures how much investors pay per dollar of earnings. A high P/E may signal growth expectations; a low P/E may suggest undervaluation or declining earnings.',
    goodRange: '15–25 for mature companies',
  },
  {
    label: 'EPS (TTM)',
    explanation:
      'Earnings Per Share over the trailing twelve months. Shows how much profit the company generates per share. Higher is generally better.',
  },
  {
    label: 'Revenue/Share',
    explanation:
      'Total revenue divided by outstanding shares. Growing revenue per share indicates the business is scaling.',
  },
  {
    label: 'Price/Book',
    explanation:
      'Compares stock price to book value (assets minus liabilities). Below 1.0 may indicate undervaluation; above 3.0 is common for asset-light tech companies.',
    goodRange: '1.0–3.0',
  },
  {
    label: 'Dividend Yield',
    explanation:
      'Annual dividends as a percentage of the stock price. Higher yield means more income, but very high yields can signal unsustainable payouts.',
    goodRange: '2%–5% for income stocks',
  },
  {
    label: 'ROE',
    explanation:
      'Return on Equity shows how efficiently the company uses shareholder equity to generate profit. Above 15% is generally strong.',
    goodRange: '15%–25%',
  },
  {
    label: 'Debt/Equity',
    explanation:
      'Measures financial leverage. Higher values mean more debt relative to equity. Above 2.0 may indicate high financial risk.',
    goodRange: 'Below 1.5',
  },
  {
    label: 'Net Margin',
    explanation:
      'Percentage of revenue that becomes profit after all expenses. Higher margins indicate better pricing power and cost control.',
    goodRange: '10%+ for most industries',
  },
  {
    label: 'Beta',
    explanation:
      'Measures stock volatility relative to the market. Beta > 1 means more volatile than the market; < 1 means less volatile.',
    goodRange: '0.8–1.2 for moderate risk',
  },
  {
    label: '52W High',
    explanation:
      'The highest price in the last 52 weeks. Proximity to the 52W high can indicate momentum.',
  },
  {
    label: '52W Low',
    explanation:
      'The lowest price in the last 52 weeks. Proximity to the 52W low may signal a buying opportunity or ongoing weakness.',
  },
  {
    label: 'Market Cap',
    explanation:
      'Total market value of outstanding shares. Large cap (>$10B) tends to be more stable; small cap (<$2B) can be more volatile but offers growth potential.',
  },
];

interface HealthCheck {
  title: string;
  body: string;
  color: string;
}

function generateHealthChecks(m: Record<string, number | null | undefined>): HealthCheck[] {
  const checks: HealthCheck[] = [];
  const pe = m.peBasicExclExtraTTM;
  if (pe != null && Number.isFinite(pe)) {
    if (pe > 0 && pe < 15) {
      checks.push({ title: 'Value territory', body: `P/E of ${pe.toFixed(1)} is below average — may be undervalued.`, color: '#22C55E' });
    } else if (pe > 40) {
      checks.push({ title: 'High valuation', body: `P/E of ${pe.toFixed(1)} is elevated — priced for strong growth.`, color: '#F59E0B' });
    } else if (pe < 0) {
      checks.push({ title: 'Negative earnings', body: 'The company is currently unprofitable.', color: '#EF4444' });
    }
  }

  const roe = m.roeTTM;
  if (roe != null && Number.isFinite(roe)) {
    if (roe > 20) {
      checks.push({ title: 'Strong profitability', body: `ROE of ${roe.toFixed(1)}% indicates efficient use of equity.`, color: '#22C55E' });
    } else if (roe < 5) {
      checks.push({ title: 'Weak returns', body: `ROE of ${roe.toFixed(1)}% is below average.`, color: '#F59E0B' });
    }
  }

  const de = m['totalDebt/totalEquityQuarterly'];
  if (de != null && Number.isFinite(de)) {
    if (de > 2) {
      checks.push({ title: 'High leverage', body: `D/E of ${de.toFixed(2)} — significant debt load.`, color: '#EF4444' });
    } else if (de < 0.5) {
      checks.push({ title: 'Low debt', body: `D/E of ${de.toFixed(2)} — conservatively financed.`, color: '#22C55E' });
    }
  }

  const margin = m.netProfitMarginTTM;
  if (margin != null && Number.isFinite(margin)) {
    if (margin > 20) {
      checks.push({ title: 'Excellent margins', body: `${margin.toFixed(1)}% net margin — strong pricing power.`, color: '#22C55E' });
    } else if (margin < 5 && margin > 0) {
      checks.push({ title: 'Thin margins', body: `${margin.toFixed(1)}% net margin — limited room for error.`, color: '#F59E0B' });
    } else if (margin < 0) {
      checks.push({ title: 'Operating at a loss', body: `${margin.toFixed(1)}% net margin — burning cash.`, color: '#EF4444' });
    }
  }

  const divYield = m.dividendYieldIndicatedAnnual;
  if (divYield != null && Number.isFinite(divYield) && divYield > 0) {
    if (divYield > 5) {
      checks.push({ title: 'High yield', body: `${divYield.toFixed(2)}% dividend yield — verify sustainability.`, color: '#F59E0B' });
    } else if (divYield > 2) {
      checks.push({ title: 'Income stock', body: `${divYield.toFixed(2)}% dividend yield — solid income.`, color: '#22C55E' });
    }
  }

  if (checks.length === 0) {
    checks.push({ title: 'Insufficient data', body: 'Not enough metrics available for a health check.', color: theme.colors.textTertiary });
  }

  return checks.slice(0, 5);
}

function formatMetric(
  value: number | null | undefined,
  decimals: number,
  prefix = '',
  suffix = ''
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  // Finnhub returns market cap in millions
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}T`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.xs },
  centered: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
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
  pickerScroll: { marginBottom: theme.spacing.sm },
  pickerRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  pickerChip: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pickerChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  pickerText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
  },
  pickerTextActive: {
    color: theme.colors.textPrimary,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  sectionTitle: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  toggleText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  toggleTextActive: {
    color: theme.colors.background,
    fontWeight: '500',
  },
  chart: { borderRadius: theme.radius.sm },
  noDataText: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    paddingVertical: theme.spacing.md,
  },
  surpriseTable: {
    marginTop: theme.spacing.sm,
  },
  surpriseHeader: {
    flexDirection: 'row',
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  surpriseRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  surpriseCell: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  surprisePeriod: {
    color: theme.colors.textTertiary,
    flex: 0.8,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metricCard: {
    flexBasis: '48%',
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  metricLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  metricValue: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },

  // Deep Dive button
  deepDiveBtn: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.accent + '20',
    borderRadius: theme.radius.pill,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  deepDiveBtnText: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },

  // Profile grid
  profileGrid: {
    gap: 4,
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  profileLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
  },
  profileValue: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    flex: 1,
    textAlign: 'right',
    marginLeft: theme.spacing.sm,
  },

  // Explanations
  explanationRow: {
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  explanationLabel: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  explanationText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  explanationRange: {
    ...theme.typography.small,
    color: theme.colors.accent,
    marginTop: 2,
    fontStyle: 'italic',
  },

  // Health checks
  healthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.xs,
    marginTop: 3,
  },
  healthContent: {
    flex: 1,
  },
  healthTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginBottom: 1,
  },
  healthBody: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
});
