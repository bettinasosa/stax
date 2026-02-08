import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { AlertItem } from './useUpcomingAlerts';
import { theme } from '../../utils/theme';

interface AlertsListProps {
  items: AlertItem[];
  onPressAlert: (holdingId: string, eventId: string) => void;
  loading?: boolean;
}

/**
 * Reusable component to display a list of upcoming alerts.
 */
export function AlertsList({ items, onPressAlert, loading }: AlertsListProps) {
  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  if (loading && items.length === 0) {
    return <Text style={styles.emptyText}>Loading…</Text>;
  }

  if (items.length === 0) {
    return <Text style={styles.emptyText}>No upcoming alerts</Text>;
  }

  return (
    <>
      {items.map(({ event, holding }) => (
        <TouchableOpacity
          key={event.id}
          style={styles.row}
          onPress={() => onPressAlert(holding.id, event.id)}
          activeOpacity={0.7}
        >
          <View style={styles.rowLeft}>
            <Text style={styles.holdingName} numberOfLines={1}>
              {holding.name}
            </Text>
            <Text style={styles.eventKind}>{event.kind.replace(/_/g, ' ')}</Text>
          </View>
          <Text style={styles.date}>{formatDate(event.date)}</Text>
        </TouchableOpacity>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.layout.screenPadding,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
    minHeight: theme.layout.rowHeight,
  },
  rowLeft: { flex: 1 },
  holdingName: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  eventKind: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  date: {
    ...theme.typography.captionMedium,
    color: theme.colors.textTertiary,
  },
});
