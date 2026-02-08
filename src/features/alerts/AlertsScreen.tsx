import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { holdingRepo, eventRepo } from '../../data';
import { usePortfolio } from '../portfolio/usePortfolio';
import type { Event } from '../../data/schemas';
import type { Holding } from '../../data/schemas';
import { theme } from '../../utils/theme';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../../services/notifications';

type AlertItem = { event: Event; holding: Holding };

/**
 * Alerts tab: upcoming events, notifications toggle, Add custom reminder.
 * Purpose: "See reminders and dates in one place."
 */
export function AlertsScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { activePortfolioId, portfolio } = usePortfolio();
  const [items, setItems] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const loadNotifications = useCallback(async () => {
    const enabled = await getNotificationPermission();
    setNotificationsEnabled(enabled);
  }, []);

  const load = useCallback(async () => {
    if (!activePortfolioId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const holdings = await holdingRepo.getByPortfolioId(db, activePortfolioId);
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
  }, [db, activePortfolioId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleNotificationsToggle = async (value: boolean) => {
    if (value) {
      const granted = await requestNotificationPermission();
      setNotificationsEnabled(granted);
      if (!granted) {
        Alert.alert(
          'Notifications',
          'Permission denied. You can enable notifications in system settings.'
        );
      }
    } else {
      setNotificationsEnabled(false);
    }
  };

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

  const eventsList = (
    <>
      {items.length === 0 ? (
        <Text style={styles.emptyListText}>No upcoming alerts</Text>
      ) : (
        items.map(({ event, holding }) => (
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
        ))
      )}
    </>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.textPrimary} />
      }
    >
      {portfolio && (
        <Text style={styles.portfolioLabel}>Upcoming for {portfolio.name}</Text>
      )}
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Notifications enabled</Text>
        <Switch
          value={notificationsEnabled}
          onValueChange={handleNotificationsToggle}
          trackColor={{ false: theme.colors.border, true: theme.colors.positive }}
          thumbColor={theme.colors.white}
        />
      </View>
      <Text style={styles.sectionTitle}>Upcoming</Text>
      {eventsList}
      <TouchableOpacity
        style={styles.addReminderButton}
        onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Holdings')}
      >
        <Text style={styles.addReminderText}>Add custom reminder</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  portfolioLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius,
    marginBottom: theme.spacing.sm,
  },
  toggleLabel: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
  },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  emptyListText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  addReminderButton: {
    marginTop: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  addReminderText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
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
