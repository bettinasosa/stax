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
import { holdingRepo, lotRepo, transactionRepo } from '../../data';
import type { Holding, Lot } from '../../data/schemas';
import { computeFifoSell } from '../portfolio/fifo';
import { usePortfolio } from '../portfolio/usePortfolio';
import { formatMoney } from '../../utils/money';
import { trackSellRecorded } from '../../services/analytics';
import { theme } from '../../utils/theme';

type Params = { RecordSell: { holdingId: string } };

export function RecordSellScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<Params, 'RecordSell'>>();
  const holdingId = route.params?.holdingId ?? '';
  const { refresh } = usePortfolio();

  const [holding, setHolding] = useState<Holding | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [quantity, setQuantity] = useState('');
  const [pricePerUnit, setPricePerUnit] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [note, setNote] = useState('');

  useEffect(() => {
    (async () => {
      const [h, l] = await Promise.all([
        holdingRepo.getById(db, holdingId),
        lotRepo.getByHoldingId(db, holdingId),
      ]);
      setHolding(h ?? null);
      setLots(l);
      if (h) setCurrency(h.currency);
      setLoading(false);
    })();
  }, [db, holdingId]);

  const handleSave = async () => {
    if (!holding) return;
    const qty = parseFloat(quantity);
    const price = parseFloat(pricePerUnit);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Invalid input', 'Quantity must be a positive number.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Invalid input', 'Price per unit must be a non-negative number.');
      return;
    }
    if (holding.quantity != null && qty > holding.quantity) {
      Alert.alert('Invalid input', `You only hold ${holding.quantity} units.`);
      return;
    }
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      Alert.alert('Invalid input', 'Date must be in YYYY-MM-DD format.');
      return;
    }

    setSaving(true);
    try {
      const fifo = computeFifoSell(lots, qty, price);
      const totalAmount = qty * price;

      await transactionRepo.create(db, {
        holdingId,
        type: 'sell',
        date: d.toISOString(),
        quantity: qty,
        pricePerUnit: price,
        totalAmount,
        currency,
        realizedGainLoss: fifo.realizedGainLoss,
        note: note || undefined,
      });

      const oldQty = holding.quantity ?? 0;
      const newQty = oldQty - qty;
      // costBasis is per-unit: recompute after selling via FIFO
      const oldTotalCost = (holding.costBasis ?? 0) * oldQty;
      const remainingTotalCost = Math.max(0, oldTotalCost - fifo.totalCostConsumed);
      const newCostBasis = newQty > 0 ? remainingTotalCost / newQty : 0;
      await holdingRepo.update(db, holdingId, {
        quantity: newQty,
        costBasis: newCostBasis,
      });

      trackSellRecorded(holding.symbol ?? holding.name, qty);
      refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to record sell');
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
      {holding.quantity != null && (
        <Text style={styles.muted}>Current quantity: {holding.quantity}</Text>
      )}

      <Text style={styles.label}>Quantity sold</Text>
      <TextInput
        style={styles.input}
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Price per unit</Text>
      <TextInput
        style={styles.input}
        value={pricePerUnit}
        onChangeText={setPricePerUnit}
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

      {quantity && pricePerUnit && (() => {
        const qty = parseFloat(quantity);
        const price = parseFloat(pricePerUnit);
        if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0) return null;
        const fifo = computeFifoSell(lots, qty, price);
        const proceeds = qty * price;
        return (
          <View style={styles.preview}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Proceeds</Text>
              <Text style={styles.previewValue}>{formatMoney(proceeds, currency)}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Cost basis (FIFO)</Text>
              <Text style={styles.previewValue}>{formatMoney(fifo.totalCostConsumed, 'USD')}</Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Realized P&L</Text>
              <Text style={[
                styles.previewValue,
                fifo.realizedGainLoss >= 0 ? styles.positive : styles.negative,
              ]}>
                {fifo.realizedGainLoss >= 0 ? '+' : ''}{formatMoney(fifo.realizedGainLoss, currency)}
              </Text>
            </View>
          </View>
        );
      })()}

      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.buttonText}>Record sell</Text>
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
  preview: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  previewLabel: { ...theme.typography.caption, color: theme.colors.textSecondary },
  previewValue: { ...theme.typography.captionMedium, color: theme.colors.textPrimary },
  positive: { color: theme.colors.positive },
  negative: { color: theme.colors.negative },
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
