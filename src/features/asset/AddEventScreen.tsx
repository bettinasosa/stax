import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { eventRepo, holdingRepo } from '../../data';
import { createEventSchema } from '../../data/schemas';
import { scheduleEventNotification, cancelEventNotification } from '../../services/notifications';
import { useEntitlements } from '../analysis/useEntitlements';
import { FREE_REMINDER_SCHEDULES_LIMIT } from '../../utils/constants';
import { EVENT_KINDS, DEFAULT_REMIND_DAYS_BEFORE } from '../../utils/constants';
import { trackEventCreated } from '../../services/analytics';
import type { EventKind } from '../../utils/constants';
import { theme } from '../../utils/theme';

type Params = { AddEvent: { holdingId: string; eventId?: string } };

/**
 * Add or edit an event (maturity, coupon, valuation reminder, etc.).
 */
export function AddEventScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Params, 'AddEvent'>>();
  const holdingId = route.params?.holdingId ?? '';
  const eventId = route.params?.eventId;
  const isEdit = Boolean(eventId);
  const { isPro } = useEntitlements();

  const [kind, setKind] = useState<EventKind>('valuation_reminder');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(DEFAULT_REMIND_DAYS_BEFORE));
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(!!eventId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    (async () => {
      const ev = await eventRepo.getById(db, eventId);
      if (!cancelled && ev) {
        setKind(ev.kind);
        setDate(ev.date.slice(0, 10));
        setAmount(ev.amount != null ? String(ev.amount) : '');
        setCurrency(ev.currency ?? 'USD');
        setRemindDaysBefore(String(ev.remindDaysBefore));
        setNote(ev.note ?? '');
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [db, eventId]);

  const handleSave = async () => {
    if (!isEdit && !isPro) {
      const holding = await holdingRepo.getById(db, holdingId);
      if (holding) {
        const count = await eventRepo.countSchedulesByPortfolioId(db, holding.portfolioId);
        if (count >= FREE_REMINDER_SCHEDULES_LIMIT) {
          Alert.alert(
            'Limit reached',
            `Free accounts can have up to ${FREE_REMINDER_SCHEDULES_LIMIT} reminder schedule. Upgrade to Pro for unlimited.`,
            [{ text: 'OK' }]
          );
          return;
        }
      }
    }
    const d = new Date(date);
    if (!date.trim() || Number.isNaN(d.getTime())) {
      Alert.alert('Invalid input', 'Event date is required.');
      return;
    }
    const parsed = createEventSchema.safeParse({
      holdingId,
      kind,
      date: d.toISOString(),
      amount: amount ? parseFloat(amount) : undefined,
      currency: currency || undefined,
      remindDaysBefore: parseInt(remindDaysBefore, 10) || DEFAULT_REMIND_DAYS_BEFORE,
      note: note || undefined,
    });
    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      if (isEdit && eventId) {
        await cancelEventNotification(eventId);
        const updated = await eventRepo.update(db, eventId, {
          kind: parsed.data.kind,
          date: parsed.data.date,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
          remindDaysBefore: parsed.data.remindDaysBefore,
          note: parsed.data.note,
        });
        if (updated) await scheduleEventNotification(updated);
      } else {
        const created = await eventRepo.create(db, parsed.data);
        await scheduleEventNotification(created);
        trackEventCreated();
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
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
      <Text style={styles.label}>Event type</Text>
      <View style={styles.row}>
        {(EVENT_KINDS as readonly string[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, kind === k && styles.chipActive]}
            onPress={() => setKind(k as EventKind)}
          >
            <Text style={kind === k ? styles.chipTextActive : styles.chipText}>
              {k.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />
      <Text style={styles.label}>Amount (optional)</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0"
        keyboardType="decimal-pad"
      />
      <Text style={styles.label}>Currency</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        placeholder="USD"
      />
      <Text style={styles.label}>Remind me (days before)</Text>
      <TextInput
        style={styles.input}
        value={remindDaysBefore}
        onChangeText={setRemindDaysBefore}
        placeholder="3"
        keyboardType="number-pad"
      />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder=""
        multiline
      />
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.buttonText}>{isEdit ? 'Update' : 'Add event'}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
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
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  chipText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chipTextActive: { ...theme.typography.caption, color: theme.colors.background },
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: theme.colors.background,
    ...theme.typography.bodyMedium,
  },
});
