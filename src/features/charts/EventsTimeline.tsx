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
import { theme } from '../../utils/theme';
import { formatMoney } from '../../utils/money';

type EventFilter = 'all' | 'maturity' | 'coupon' | 'custom';

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'maturity', label: 'Maturity' },
  { key: 'coupon', label: 'Coupon' },
  { key: 'custom', label: 'Custom' },
];

interface Props {
  portfolioId: string | null;
  onPressHolding?: (holdingId: string) => void;
}

export function EventsTimeline({ portfolioId, onPressHolding }: Props) {
  const { items, loading } = useUpcomingAlerts(portfolioId);
  const [filter, setFilter] = useState<EventFilter>('all');

  const grouped = useMemo(() => {
    const filtered =
      filter === 'all'
        ? items
        : items.filter((i) => i.event.kind === filter);

    const groups = new Map<string, AlertItem[]>();
    for (const item of filtered) {
      const d = new Date(item.event.date);
      const monthKey = d.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      });
      if (!groups.has(monthKey)) groups.set(monthKey, []);
      groups.get(monthKey)!.push(item);
    }
    return groups;
  }, [items, filter]);

  if (loading && items.length === 0) {
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
            Add events to your holdings (maturity dates, coupons, reminders) to
            see them here.
          </Text>
        </View>
      ) : (
        Array.from(grouped.entries()).map(([month, events]) => (
          <View key={month} style={styles.section}>
            <Text style={styles.monthHeader}>{month}</Text>
            {events.map(({ event, holding }) => (
              <TouchableOpacity
                key={event.id}
                style={styles.eventRow}
                onPress={() => onPressHolding?.(holding.id)}
                activeOpacity={0.7}
              >
                <View style={styles.eventLeft}>
                  <Text style={styles.eventDate}>
                    {new Date(event.date).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                </View>
                <View style={styles.eventCenter}>
                  <Text style={styles.holdingName} numberOfLines={1}>
                    {holding.name}
                  </Text>
                  <Text style={styles.eventKind}>
                    {event.kind.replace(/_/g, ' ')}
                    {event.amount != null
                      ? ` · ${formatMoney(event.amount, event.currency ?? 'USD')}`
                      : ''}
                  </Text>
                </View>
                {event.note ? (
                  <Text style={styles.eventNote} numberOfLines={1}>
                    {event.note}
                  </Text>
                ) : null}
              </TouchableOpacity>
            ))}
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
});
