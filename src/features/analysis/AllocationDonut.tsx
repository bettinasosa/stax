import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ExposureSlice } from './analysisUtils';
import { theme } from '../../utils/theme';

const COLORS = [
  '#7C3AED', '#3B82F6', '#22C55E', '#F59E0B', '#EF4444',
  '#EC4899', '#06B6D4', '#8B5CF6', '#10B981', '#F97316',
];

const TABS = [
  { key: 'asset_class', label: 'Asset Class' },
  { key: 'currency', label: 'Currency' },
  { key: 'country', label: 'Country' },
  { key: 'sector', label: 'Sector' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface AllocationDonutProps {
  exposure: ExposureSlice[];
}

/** Group slices < 3% into "Other". */
function groupSmall(slices: ExposureSlice[]): { label: string; percent: number }[] {
  const big: { label: string; percent: number }[] = [];
  let otherPct = 0;
  for (const s of slices) {
    if (s.percent < 3) otherPct += s.percent;
    else big.push({ label: s.label, percent: s.percent });
  }
  if (otherPct > 0) big.push({ label: 'Other', percent: otherPct });
  return big.sort((a, b) => b.percent - a.percent);
}

/** Build SVG arc path for a donut slice. */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Tabbed donut chart showing allocation by asset class, currency, country, or sector.
 */
export function AllocationDonut({ exposure }: AllocationDonutProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('asset_class');

  const filteredSlices = useMemo(
    () => groupSmall(exposure.filter((s) => s.type === activeTab)),
    [exposure, activeTab]
  );

  const availableTabs = useMemo(
    () => TABS.filter((t) => exposure.some((s) => s.type === t.key)),
    [exposure]
  );

  const size = 140;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Build arcs
  const arcs = useMemo(() => {
    const result: { path: string; color: string }[] = [];
    let cursor = 0;
    const gap = filteredSlices.length > 1 ? 2 : 0;
    for (let i = 0; i < filteredSlices.length; i++) {
      const slice = filteredSlices[i];
      const sweep = (slice.percent / 100) * 360 - gap;
      if (sweep <= 0) continue;
      result.push({
        path: arcPath(cx, cy, radius, cursor, cursor + sweep),
        color: COLORS[i % COLORS.length],
      });
      cursor += sweep + gap;
    }
    return result;
  }, [filteredSlices, cx, cy, radius]);

  if (availableTabs.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {availableTabs.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filteredSlices.length === 0 ? (
        <Text style={styles.empty}>No data for this category yet.</Text>
      ) : (
        <View style={styles.chartRow}>
          <Svg width={size} height={size}>
            {arcs.map((a, i) => (
              <Path
                key={i}
                d={a.path}
                stroke={a.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </Svg>
          <View style={styles.legend}>
            {filteredSlices.map((s, i) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: COLORS[i % COLORS.length] }]} />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={styles.legendValue}>{s.percent.toFixed(1)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: theme.spacing.sm },
  tabRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
  },
  tabActive: { backgroundColor: theme.colors.accent },
  tabText: { ...theme.typography.small, color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.white },
  empty: { ...theme.typography.caption, color: theme.colors.textTertiary, paddingVertical: theme.spacing.sm },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  legend: { flex: 1 },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendLabel: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    flex: 1,
    marginRight: 4,
    textTransform: 'capitalize',
  },
  legendValue: { ...theme.typography.small, color: theme.colors.textPrimary },
});
