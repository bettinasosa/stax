import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ConcentrationMetrics } from './analysisUtils';
import { theme } from '../../utils/theme';
import {
  STAX_SCORE_TOP_HOLDING_THRESHOLD,
  STAX_SCORE_TOP3_THRESHOLD,
  STAX_SCORE_COUNTRY_THRESHOLD,
  STAX_SCORE_SECTOR_THRESHOLD,
} from '../../utils/constants';

const BAR_COLOR_GOOD = theme.colors.positive;
const BAR_COLOR_WARN = '#F59E0B';
const BAR_COLOR_BAD = theme.colors.negative;

interface BarDef {
  label: string;
  value: number;
  threshold: number;
  max: number;
}

function barColor(value: number, threshold: number): string {
  if (value > threshold) return BAR_COLOR_BAD;
  if (value > threshold * 0.75) return BAR_COLOR_WARN;
  return BAR_COLOR_GOOD;
}

interface ConcentrationBarsProps {
  concentration: ConcentrationMetrics;
  largestAssetClassPercent: number;
}

/**
 * Visual progress bars for concentration metrics with colour-coded thresholds.
 */
export function ConcentrationBars({
  concentration,
  largestAssetClassPercent,
}: ConcentrationBarsProps) {
  const bars: BarDef[] = [
    {
      label: 'Top holding',
      value: concentration.topHoldingPercent,
      threshold: STAX_SCORE_TOP_HOLDING_THRESHOLD,
      max: 100,
    },
    {
      label: 'Top 3 holdings',
      value: concentration.top3CombinedPercent,
      threshold: STAX_SCORE_TOP3_THRESHOLD,
      max: 100,
    },
    {
      label: 'Largest asset class',
      value: largestAssetClassPercent,
      threshold: 50,
      max: 100,
    },
  ];

  if (concentration.largestCountryPercent > 0) {
    bars.push({
      label: 'Largest country',
      value: concentration.largestCountryPercent,
      threshold: STAX_SCORE_COUNTRY_THRESHOLD,
      max: 100,
    });
  }
  if (concentration.largestSectorPercent > 0) {
    bars.push({
      label: 'Largest sector',
      value: concentration.largestSectorPercent,
      threshold: STAX_SCORE_SECTOR_THRESHOLD,
      max: 100,
    });
  }

  return (
    <View>
      {bars.map((b) => {
        const pct = Math.min(b.value / b.max, 1);
        const thresholdPct = b.threshold / b.max;
        const color = barColor(b.value, b.threshold);
        return (
          <View key={b.label} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>{b.label}</Text>
              <Text style={[styles.value, { color }]}>{b.value.toFixed(1)}%</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: color }]} />
              <View
                style={[
                  styles.thresholdTick,
                  { left: `${thresholdPct * 100}%` },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: theme.spacing.xs },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: { ...theme.typography.small, color: theme.colors.textSecondary },
  value: { ...theme.typography.small },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  thresholdTick: {
    position: 'absolute',
    top: -1,
    width: 2,
    height: 8,
    backgroundColor: theme.colors.textTertiary,
    borderRadius: 1,
  },
});
