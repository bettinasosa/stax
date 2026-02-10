import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useUpcomingAlerts, type AlertItem } from '../alerts/useUpcomingAlerts';
import { useEarningsCalendar, type EarningsEvent } from './hooks/useEarningsCalendar';
import { theme } from '../../utils/theme';
import { formatMoney } from '../../utils/money';
import type { Holding } from '../../data/schemas';

type EventFilter = 'all' | 'maturity' | 'coupon' | 'custom' | 'earnings';

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'maturity', label: 'Maturity' },
  { key: 'coupon', label: 'Coupon' },
  { key: 'custom', label: 'Custom' },
];

/** Unified timeline item – either a local event or a Finnhub earnings date. */
type TimelineItem =
  | { type: 'local'; event: AlertItem['event']; holding: AlertItem['holding'] }
  | { type: 'earnings'; data: EarningsEvent };

interface Props {
  portfolioId: string | null;
  holdings?: Holding[];
  onPressHolding?: (holdingId: string) => void;
}

/**
 * Unified events timeline: local events (maturity, coupon, custom) +
 * upcoming earnings dates pulled from Finnhub.
 */
export function EventsTimeline({ portfolioId, holdings = [], onPressHolding }: Props) {
  const { items, loading } = useUpcomingAlerts(portfolioId);
  const { earningsEvents, earningsLoading } = useEarningsCalendar(holdings);
  const [filter, setFilter] = useState<EventFilter>('all');

  /** Merge local events and earnings into a single sorted timeline. */
  const grouped = useMemo(() => {
    const timeline: TimelineItem[] = [];

    // Add local events (filtered by kind)
    if (filter === 'all' || (filter !== 'earnings')) {
      const localFiltered =
        filter === 'all'
          ? items
          : items.filter((i) => i.event.kind === filter);
      for (const item of localFiltered) {
        timeline.push({ type: 'local', event: item.event, holding: item.holding });
      }
    }

    // Add earnings events
    if (filter === 'all' || filter === 'earnings') {
      for (const e of earningsEvents) {
        timeline.push({ type: 'earnings', data: e });
      }
    }

    // Sort by date ascending
    timeline.sort((a, b) => {
      const dateA = a.type === 'local' ? a.event.date : a.data.date;
      const dateB = b.type === 'local' ? b.event.date : b.data.date;
      return dateA.localeCompare(dateB);
    });

    // Group by month
    const groups = new Map<string, TimelineItem[]>();
    for (const item of timeline) {
      const dateStr = item.type === 'local' ? item.event.date : item.data.date;
      const d = new Date(dateStr);
      const monthKey = d.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
      if (!groups.has(monthKey)) groups.set(monthKey, []);
      groups.get(monthKey)!.push(item);
    }
    return groups;
  }, [items, earningsEvents, filter]);

  const isLoading = loading || earningsLoading;

  if (isLoading && items.length === 0 && earningsEvents.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.textPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
      >
        <View style={styles.filtersRow}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === f.key && styles.filterTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {grouped.size === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No upcoming events</Text>
          <Text style={styles.emptyText}>
            Add events to your holdings or hold stocks/ETFs to see upcoming
            earnings dates here.
          </Text>
        </View>
      ) : (
        Array.from(grouped.entries()).map(([month, timelineItems]) => (
          <View key={month} style={styles.section}>
            <Text style={styles.monthHeader}>{month}</Text>
            {timelineItems.map((item) =>
              item.type === 'local' ? (
                <TouchableOpacity
                  key={item.event.id}
                  style={styles.eventRow}
                  onPress={() => onPressHolding?.(item.holding.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventLeft}>
                    <Text style={styles.eventDate}>
                      {new Date(item.event.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={styles.eventCenter}>
                    <Text style={styles.holdingName} numberOfLines={1}>
                      {item.holding.name}
                    </Text>
                    <Text style={styles.eventKind}>
                      {item.event.kind.replace(/_/g, ' ')}
                      {item.event.amount != null
                        ? ` · ${formatMoney(item.event.amount, item.event.currency ?? 'USD')}`
                        : ''}
                    </Text>
                  </View>
                  {item.event.note ? (
                    <Text style={styles.eventNote} numberOfLines={1}>
                      {item.event.note}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={item.data.id}
                  style={[styles.eventRow, styles.earningsRow]}
                  onPress={() => item.data.holdingId && onPressHolding?.(item.data.holdingId)}
                  activeOpacity={0.7}
                >
                  <View style={styles.eventLeft}>
                    <Text style={styles.eventDate}>
                      {new Date(item.data.date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={styles.eventCenter}>
                    <Text style={styles.holdingName} numberOfLines={1}>
                      {item.data.holdingName}
                    </Text>
                    <Text style={styles.earningsKind}>
                      Earnings{item.data.hour === 'bmo' ? ' (pre-market)' : item.data.hour === 'amc' ? ' (after-close)' : ''}
                    </Text>
                  </View>
                  <View style={styles.earningsRight}>
                    {item.data.epsEstimate != null && (
                      <Text style={styles.earningsEstimate}>
                        EPS est. ${item.data.epsEstimate.toFixed(2)}
                      </Text>
                    )}
                    <View style={styles.earningsBadge}>
                      <Text style={styles.earningsBadgeText}>EARNINGS</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              )
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: theme.spacing.xs },
  centered: {
    paddingVertical: theme.spacing.xl,
    alignItems: 'center',
  },
  filtersScroll: { marginBottom: theme.spacing.sm },
  filtersRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  filterText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  filterTextActive: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
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
  section: { marginBottom: theme.spacing.sm },
  monthHeader: {
    ...theme.typography.captionMedium,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  eventLeft: {
    width: 52,
    marginRight: theme.spacing.sm,
  },
  eventDate: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  eventCenter: { flex: 1 },
  holdingName: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  eventKind: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  eventNote: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    maxWidth: 80,
    textAlign: 'right',
  },

  // Earnings-specific styles
  earningsRow: {
    borderLeftWidth: 3,
    borderLeftColor: '#7C3AED',
  },
  earningsKind: {
    ...theme.typography.small,
    color: '#7C3AED',
  },
  earningsRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  earningsEstimate: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  earningsBadge: {
    backgroundColor: '#7C3AED20',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  earningsBadgeText: {
    fontSize: 9,
    fontWeight: '600' as const,
    color: '#7C3AED',
    letterSpacing: 0.5,
  },
});
