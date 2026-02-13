import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useBenchmarkData } from '../charts/hooks/useBenchmarkData';
import { theme } from '../../utils/theme';

type TimeWindow = '7D' | '1M' | '3M' | 'ALL';
const WINDOWS: TimeWindow[] = ['7D', '1M', '3M', 'ALL'];

interface Props {
  valueHistory: Array<{ timestamp: string; valueBase: number }>;
}

const CHART_WIDTH = Dimensions.get('window').width - theme.layout.screenPadding * 2 - theme.spacing.sm * 2;
const CHART_HEIGHT = 180;

export function BenchmarkComparisonCard({ valueHistory }: Props) {
  const [window, setWindow] = useState<TimeWindow>('3M');
  const { portfolioReturns, spyReturns, labels, loading } = useBenchmarkData(
    window,
    true,
    valueHistory
  );

  const hasData = portfolioReturns !== null && portfolioReturns.length >= 2;
  const hasSpy = spyReturns !== null && spyReturns.length >= 2;

  const portfolioReturn = hasData ? portfolioReturns[portfolioReturns.length - 1] : null;
  const spyReturn = hasSpy ? spyReturns[spyReturns.length - 1] : null;
  const alpha = portfolioReturn !== null && spyReturn !== null ? portfolioReturn - spyReturn : null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>vs S&P 500</Text>
        <View style={styles.windowRow}>
          {WINDOWS.map((w) => (
            <TouchableOpacity
              key={w}
              style={[styles.windowBtn, window === w && styles.windowBtnActive]}
              onPress={() => setWindow(w)}
            >
              <Text style={[styles.windowText, window === w && styles.windowTextActive]}>{w}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={theme.colors.textSecondary} />
        </View>
      ) : !hasData ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Not enough portfolio history for this window.
          </Text>
        </View>
      ) : (
        <LineChart
          data={{
            labels: labels ?? [],
            datasets: [
              {
                data: portfolioReturns,
                color: (): string => theme.colors.textPrimary,
                strokeWidth: 2,
              },
              ...(hasSpy
                ? [
                    {
                      data: spyReturns,
                      color: (): string => theme.colors.accent,
                      strokeWidth: 2,
                    },
                  ]
                : []),
            ],
          }}
          width={CHART_WIDTH}
          height={CHART_HEIGHT}
          withDots={false}
          withInnerLines={false}
          withOuterLines={false}
          withVerticalLines={false}
          withHorizontalLines={true}
          chartConfig={{
            backgroundColor: theme.colors.surface,
            backgroundGradientFrom: theme.colors.surface,
            backgroundGradientTo: theme.colors.surface,
            decimalPlaces: 1,
            color: (): string => theme.colors.border,
            labelColor: (): string => theme.colors.textTertiary,
            style: { borderRadius: 0 },
            propsForDots: { r: '0' },
          }}
          bezier
          style={styles.chart}
          formatYLabel={(v) => `${parseFloat(v).toFixed(0)}%`}
        />
      )}

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.colors.textPrimary }]} />
          <Text style={styles.legendLabel}>Portfolio</Text>
        </View>
        {hasSpy && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.accent }]} />
            <Text style={styles.legendLabel}>SPY</Text>
          </View>
        )}
      </View>

      {/* Stats row */}
      {(portfolioReturn !== null || spyReturn !== null) && (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Portfolio</Text>
            <Text style={[styles.statValue, portfolioReturn! >= 0 ? styles.positive : styles.negative]}>
              {portfolioReturn! >= 0 ? '+' : ''}{portfolioReturn!.toFixed(2)}%
            </Text>
          </View>
          {spyReturn !== null && (
            <>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>SPY</Text>
                <Text style={[styles.statValue, spyReturn >= 0 ? styles.positive : styles.negative]}>
                  {spyReturn >= 0 ? '+' : ''}{spyReturn.toFixed(2)}%
                </Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Alpha</Text>
                <Text style={[styles.statValue, alpha! >= 0 ? styles.positive : styles.negative]}>
                  {alpha! >= 0 ? '+' : ''}{alpha!.toFixed(2)}%
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Hint when history is sparse so users know why the period looks short */}
      {hasData && portfolioReturns && portfolioReturns.length <= 3 && (
        <Text style={styles.hintText}>
          Based on {portfolioReturns.length} snapshot{portfolioReturns.length !== 1 ? 's' : ''}. Pull to refresh on Overview to record more history.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  title: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
  },
  windowRow: {
    flexDirection: 'row',
    gap: 4,
  },
  windowBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: theme.colors.background,
  },
  windowBtnActive: {
    backgroundColor: theme.colors.textPrimary,
  },
  windowText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  windowTextActive: {
    ...theme.typography.small,
    color: theme.colors.background,
  },
  loadingBox: {
    height: CHART_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyBox: {
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  chart: {
    marginLeft: -theme.spacing.sm,
    marginRight: -theme.spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 3,
    borderRadius: 2,
  },
  legendLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
  },
  positive: { color: theme.colors.positive },
  negative: { color: theme.colors.negative },
  hintText: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
});
