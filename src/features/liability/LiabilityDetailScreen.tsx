import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute } from '@react-navigation/native';
import { liabilityRepo } from '../../data';
import { usePortfolio } from '../portfolio/usePortfolio';
import { LIABILITY_TYPES, type LiabilityType } from '../../utils/constants';
import type { Liability } from '../../data/schemas';
import { formatMoney } from '../../utils/money';
import { theme } from '../../utils/theme';

const TYPE_LABELS: Record<LiabilityType, string> = {
  mortgage: 'Mortgage',
  loan: 'Loan',
  credit_card: 'Credit Card',
  other: 'Other',
};

export function LiabilityDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute<{ key: string; name: string; params: { liabilityId: string } }>();
  const db = useSQLiteContext();
  const { refresh } = usePortfolio();
  const { liabilityId } = route.params;

  const [liability, setLiability] = useState<Liability | null>(null);
  const [editing, setEditing] = useState(false);

  // Editable fields
  const [name, setName] = useState('');
  const [type, setType] = useState<LiabilityType>('loan');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [interestRate, setInterestRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const l = await liabilityRepo.getById(db, liabilityId);
      if (l) {
        setLiability(l);
        setName(l.name);
        setType(l.type);
        setBalance(l.balance.toString());
        setCurrency(l.currency);
        setInterestRate(l.interestRate != null ? l.interestRate.toString() : '');
        setNote(l.note ?? '');
      }
    })();
  }, [db, liabilityId]);

  const handleSave = async () => {
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) {
      Alert.alert('Invalid balance', 'Enter a valid balance amount.');
      return;
    }
    setSaving(true);
    try {
      const rate = interestRate.trim() ? parseFloat(interestRate) : null;
      await liabilityRepo.update(db, liabilityId, {
        name: name.trim(),
        type,
        balance: bal,
        currency: currency.trim().toUpperCase() || 'USD',
        interestRate: rate,
        note: note.trim() || null,
      });
      refresh();
      setEditing(false);
      const updated = await liabilityRepo.getById(db, liabilityId);
      if (updated) setLiability(updated);
    } catch {
      Alert.alert('Error', 'Failed to update liability.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete liability', `Remove "${liability?.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await liabilityRepo.remove(db, liabilityId);
          refresh();
          navigation.goBack();
        },
      },
    ]);
  };

  if (!liability) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>Loading...</Text>
      </View>
    );
  }

  if (!editing) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{liability.name}</Text>
        <Text style={styles.typeBadge}>{TYPE_LABELS[liability.type]}</Text>

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Balance</Text>
            <Text style={styles.detailValue}>{formatMoney(liability.balance, liability.currency)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Currency</Text>
            <Text style={styles.detailValue}>{liability.currency}</Text>
          </View>
          {liability.interestRate != null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Interest Rate</Text>
              <Text style={styles.detailValue}>{liability.interestRate}%</Text>
            </View>
          )}
          {liability.note ? (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Note</Text>
              <Text style={styles.detailValue}>{liability.note}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}>
            <Text style={styles.editButtonText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // Edit mode
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {LIABILITY_TYPES.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typePill, type === t && styles.typePillActive]}
            onPress={() => setType(t)}
          >
            <Text style={[styles.typePillText, type === t && styles.typePillTextActive]}>
              {TYPE_LABELS[t]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Balance</Text>
      <TextInput
        style={styles.input}
        value={balance}
        onChangeText={setBalance}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Currency</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        autoCapitalize="characters"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Interest Rate (% optional)</Text>
      <TextInput
        style={styles.input}
        value={interestRate}
        onChangeText={setInterestRate}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        placeholderTextColor={theme.colors.textTertiary}
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={() => setEditing(false)}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
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
  },
  loading: { ...theme.typography.body, color: theme.colors.textSecondary },
  title: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  typeBadge: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  detailCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  detailValue: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    flexShrink: 1,
    textAlign: 'right',
  },
  actionRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  editButton: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  editButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  deleteButton: {
    flex: 1,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.negative,
  },
  deleteButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.negative,
  },
  // Edit mode styles
  label: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  typePill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  typePillActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  typePillText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  typePillTextActive: {
    ...theme.typography.captionMedium,
    color: theme.colors.background,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  cancelButton: {
    flex: 1,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textSecondary,
  },
  buttonDisabled: { opacity: 0.6 },
});
