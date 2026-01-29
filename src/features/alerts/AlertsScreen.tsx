import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { holdingRepo, eventRepo } from '../../data';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import type { Event } from '../../data/schemas';
import type { Holding } from '../../data/schemas';
import { theme } from '../../utils/theme';

type AlertItem = { event: Event; holding: Holding };

/**
 * Alerts tab: upcoming events (maturity, valuation reminders, etc.) across the portfolio.
 */
export function AlertsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const holdings = await holdingRepo.getByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
    const all: AlertItem[] = [];
    const now = new Date().toISOString();
    for (const holding of holdings) {
      const events = await eventRepo.getByHoldingId(db, holding.id);
      for (const event of events) {
        if (event.date >= now) {
          all.push({ event, holding });
        }
      }
    }
    all.sort((a, b) => a.event.date.localeCompare(b.event.date));
    setItems(all);
    setLoading(false);
  }, [db]);

  useEffect(() => {
    load();
  }, [load]);

  const onPressAlert = (holdingId: string, eventId: string) => {
    (navigation as { navigate: (s: string, p: object) => void }).navigate('Holdings', {
      screen: 'HoldingDetail',
      params: { holdingId },
    });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    });
  };

  if (loading && items.length === 0) {
    return (
      <View style={[styles.center, styles.container]}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.textPrimary} />
        }
      >
        <Text style={styles.emptyTitle}>No upcoming alerts</Text>
        <Text style={styles.emptyText}>
          Add events to holdings (maturity, valuation reminders) to see them here.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.textPrimary} />
      }
    >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
  },
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
    textAlign: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
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
