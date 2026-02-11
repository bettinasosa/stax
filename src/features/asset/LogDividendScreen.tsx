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
import { holdingRepo, transactionRepo } from '../../data';
import type { Holding } from '../../data/schemas';
import { usePortfolio } from '../portfolio/usePortfolio';
import { trackDividendLogged } from '../../services/analytics';
import { theme } from '../../utils/theme';

type Params = { LogDividend: { holdingId: string } };

export function LogDividendScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Params, 'LogDividend'>>();
  const holdingId = route.params?.holdingId ?? '';
  const { refresh } = usePortfolio();

  const [holding, setHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const h = await holdingRepo.getById(db, holdingId);
      setHolding(h ?? null);
      if (h) setCurrency(h.currency);
      setLoading(false);
    })();
  }, [db, holdingId]);

  const handleSave = async () => {
    if (!holding) return;
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert('Invalid input', 'Amount must be a positive number.');
      return;
    }
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      Alert.alert('Invalid input', 'Date must be in YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    try {
      await transactionRepo.create(db, {
        holdingId,
        type: 'dividend',
        date: d.toISOString(),
        totalAmount: amt,
        currency,
        note: note || undefined,
      });

      trackDividendLogged(holding.symbol ?? holding.name, amt);
      refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to log dividend');
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

  if (!holding) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Holding not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{holding.name}</Text>
      <Text style={styles.muted}>Log a dividend or income payment</Text>

      <Text style={styles.label}>Amount received</Text>
      <TextInput
        style={styles.input}
        value={amount}
        onChangeText={setAmount}
        placeholder="0.00"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
      />

      <Text style={styles.label}>Currency</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        placeholder="USD"
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
          <Text style={styles.buttonText}>Log dividend</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.layout.screenPadding, paddingBottom: theme.spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { ...theme.typography.body, color: theme.colors.negative },
  heading: { ...theme.typography.title2, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  muted: { ...theme.typography.caption, color: theme.colors.textTertiary, marginBottom: theme.spacing.sm },
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
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.background, ...theme.typography.bodyMedium },
});
