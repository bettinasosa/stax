import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { liabilityRepo } from '../../data';
import { usePortfolio } from '../portfolio/usePortfolio';
import { LIABILITY_TYPES, type LiabilityType } from '../../utils/constants';
import { theme } from '../../utils/theme';

const TYPE_LABELS: Record<LiabilityType, string> = {
  mortgage: 'Mortgage',
  loan: 'Loan',
  credit_card: 'Credit Card',
  other: 'Other',
};

export function AddLiabilityScreen() {
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const { activePortfolioId, refresh } = usePortfolio();

  const [name, setName] = useState('');
  const [type, setType] = useState<LiabilityType>('loan');
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [interestRate, setInterestRate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter a name for this liability.');
      return;
    }
    const bal = parseFloat(balance);
    if (isNaN(bal) || bal < 0) {
      Alert.alert('Invalid balance', 'Enter a valid balance amount.');
      return;
    }
    if (!activePortfolioId) return;

    setSaving(true);
    try {
      const rate = interestRate.trim() ? parseFloat(interestRate) : null;
      await liabilityRepo.create(db, {
        portfolioId: activePortfolioId,
        name: name.trim(),
        type,
        balance: bal,
        currency: currency.trim().toUpperCase() || 'USD',
        interestRate: rate,
        note: note.trim() || null,
      });
      refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to save liability.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Home Mortgage"
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
        placeholder="0.00"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Currency</Text>
      <TextInput
        style={styles.input}
        value={currency}
        onChangeText={setCurrency}
        autoCapitalize="characters"
        placeholder="USD"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Interest Rate (% optional)</Text>
      <TextInput
        style={styles.input}
        value={interestRate}
        onChangeText={setInterestRate}
        keyboardType="decimal-pad"
        placeholder="e.g. 4.5"
        placeholderTextColor={theme.colors.textTertiary}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        placeholder="Additional details..."
        placeholderTextColor={theme.colors.textTertiary}
      />

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Add Liability'}</Text>
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
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  saveButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  buttonDisabled: { opacity: 0.6 },
});
