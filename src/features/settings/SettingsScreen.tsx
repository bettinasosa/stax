import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo, holdingRepo, eventRepo } from '../../data';
import { useAuth } from '../../contexts/AuthContext';
import { useEntitlements } from '../analysis/useEntitlements';
import {
  requestNotificationPermission,
  getNotificationPermission,
} from '../../services/notifications';
import { trackNotificationEnabled } from '../../services/analytics';
import { SUPPORTED_PRICE_FEEDS } from '../../services/supportedFeeds';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { isSupabaseConfigured } from '../../services/supabase';
import { theme } from '../../utils/theme';

/**
 * Settings: base currency, supported feeds, notifications, restore purchases.
 */
export function SettingsScreen() {
  const db = useSQLiteContext();
  const { restorePurchases } = useEntitlements();
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [editCurrency, setEditCurrency] = useState('');
  const [dbSummary, setDbSummary] = useState<{
    portfolioName: string;
    holdingsCount: number;
    eventsCount: number;
  } | null>(null);
  const [dbRaw, setDbRaw] = useState<{ portfolio: unknown[]; holding: unknown[]; event: unknown[] } | null>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await portfolioRepo.getById(db, DEFAULT_PORTFOLIO_ID);
      if (!cancelled && p) {
        setBaseCurrency(p.baseCurrency);
        setEditCurrency(p.baseCurrency);
        const holdingsCount = await holdingRepo.countByPortfolioId(db, p.id);
        const allHoldings = await holdingRepo.getByPortfolioId(db, p.id);
        let eventsTotal = 0;
        for (const h of allHoldings) {
          const evs = await eventRepo.getByHoldingId(db, h.id);
          eventsTotal += evs.length;
        }
        setDbSummary({
          portfolioName: p.name,
          holdingsCount,
          eventsCount: eventsTotal,
        });
      }
      const enabled = await getNotificationPermission();
      if (!cancelled) setNotificationsEnabled(enabled);
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [db]);

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsEnabled(granted);
    if (granted) trackNotificationEnabled();
    if (!granted) {
      Alert.alert(
        'Notifications',
        'Permission denied. You can enable notifications in system settings.'
      );
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const info = await restorePurchases();
      if (info) {
        Alert.alert('Restore', 'Purchases restored.');
      } else {
        Alert.alert('Restore', 'No previous purchase found.');
      }
    } catch {
      Alert.alert('Error', 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  const handleSaveBaseCurrency = async () => {
    const cur = editCurrency.trim().toUpperCase();
    if (cur.length !== 3) {
      Alert.alert('Invalid', 'Currency must be 3 letters (e.g. USD).');
      return;
    }
    setSavingCurrency(true);
    try {
      await portfolioRepo.update(db, DEFAULT_PORTFOLIO_ID, { baseCurrency: cur });
      setBaseCurrency(cur);
    } catch {
      Alert.alert('Error', 'Failed to update base currency.');
    } finally {
      setSavingCurrency(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {dbSummary != null && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your data</Text>
          <Text style={styles.muted}>
            Portfolio: {dbSummary.portfolioName} · {dbSummary.holdingsCount} holdings · {dbSummary.eventsCount} events
          </Text>
          <Text style={styles.mutedSmall}>
            Data is stored on this device. {isSupabaseConfigured() ? 'Sign out below if you use an account.' : 'No account required for local use.'}
          </Text>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Base currency</Text>
        <Text style={styles.muted}>Display and values use: {baseCurrency}</Text>
        <TextInput
          style={styles.input}
          value={editCurrency}
          onChangeText={setEditCurrency}
          placeholder="USD"
          placeholderTextColor={theme.colors.textTertiary}
          autoCapitalize="characters"
          maxLength={3}
        />
        <TouchableOpacity
          style={[styles.button, savingCurrency && styles.buttonDisabled]}
          onPress={handleSaveBaseCurrency}
          disabled={savingCurrency}
        >
          {savingCurrency ? (
            <ActivityIndicator color={theme.colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Supported price feeds</Text>
        <Text style={styles.feedsText}>{SUPPORTED_PRICE_FEEDS}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Text style={styles.muted}>
          {notificationsEnabled
            ? 'Notifications are enabled for event reminders.'
            : 'Enable to get reminders for maturity, valuation, etc.'}
        </Text>
        {!notificationsEnabled && (
          <TouchableOpacity style={styles.buttonSecondary} onPress={handleEnableNotifications}>
            <Text style={styles.buttonSecondaryText}>Enable notifications</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Purchases</Text>
        <TouchableOpacity
          style={[styles.buttonSecondary, restoring && styles.buttonDisabled]}
          onPress={handleRestore}
          disabled={restoring}
        >
          {restoring ? (
            <ActivityIndicator size="small" color={theme.colors.textPrimary} />
          ) : (
            <Text style={styles.buttonSecondaryText}>Restore purchases</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>View database</Text>
        <Text style={styles.muted}>
          See raw tables (portfolio, holding, event). Useful for debugging. The SQLite file lives in the app sandbox on device/simulator.
        </Text>
        <TouchableOpacity
          style={styles.buttonSecondary}
          onPress={async () => {
            const [portfolioRows] = await db.getAllAsync<unknown[]>('SELECT * FROM portfolio').then((r) => [r]).catch(() => [[]]);
            const [holdingRows] = await db.getAllAsync<unknown[]>('SELECT * FROM holding LIMIT 30').then((r) => [r]).catch(() => [[]]);
            const [eventRows] = await db.getAllAsync<unknown[]>('SELECT * FROM event LIMIT 30').then((r) => [r]).catch(() => [[]]);
            setDbRaw({
              portfolio: Array.isArray(portfolioRows) ? portfolioRows : [],
              holding: Array.isArray(holdingRows) ? holdingRows : [],
              event: Array.isArray(eventRows) ? eventRows : [],
            });
          }}
        >
          <Text style={styles.buttonSecondaryText}>{dbRaw ? 'Refresh tables' : 'Show tables'}</Text>
        </TouchableOpacity>
        {dbRaw && (
          <View style={styles.dbRaw}>
            <Text style={styles.dbRawTitle}>portfolio</Text>
            <Text style={styles.dbRawJson} selectable>
              {JSON.stringify(dbRaw.portfolio, null, 2)}
            </Text>
            <Text style={styles.dbRawTitle}>holding (max 30)</Text>
            <Text style={styles.dbRawJson} selectable>
              {JSON.stringify(dbRaw.holding, null, 2)}
            </Text>
            <Text style={styles.dbRawTitle}>event (max 30)</Text>
            <Text style={styles.dbRawJson} selectable>
              {JSON.stringify(dbRaw.event, null, 2)}
            </Text>
          </View>
        )}
      </View>

      {isSupabaseConfigured() && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity
            style={[styles.buttonDanger]}
            onPress={() => {
              Alert.alert('Sign out', 'Sign out of your account?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: signOut },
              ]);
            }}
          >
            <Text style={styles.buttonDangerText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      )}
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    fontSize: 16,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.xs,
  },
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: theme.colors.background,
    ...theme.typography.bodyMedium,
  },
  buttonSecondary: {
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginTop: theme.spacing.xs,
  },
  buttonSecondaryText: {
    color: theme.colors.textPrimary,
    ...theme.typography.body,
  },
  feedsText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  muted: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  mutedSmall: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: theme.spacing.xs,
  },
  dbRaw: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
  },
  dbRawTitle: {
    ...theme.typography.small,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  dbRawJson: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: theme.colors.textSecondary,
  },
  buttonDanger: {
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.negative,
  },
  buttonDangerText: {
    color: theme.colors.negative,
    ...theme.typography.body,
  },
});
