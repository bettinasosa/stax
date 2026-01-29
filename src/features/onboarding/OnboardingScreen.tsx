import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo } from '../../data';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { theme } from '../../utils/theme';

type Step = 'welcome' | 'currency' | 'done';

export function OnboardingScreen() {
  const { setOnboardingDone } = useAuth();
  const db = useSQLiteContext();
  const [step, setStep] = useState<Step>('welcome');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  const handleGetStarted = () => {
    if (step === 'welcome') setStep('currency');
    else if (step === 'currency') {
      setSaving(true);
      portfolioRepo
        .update(db, DEFAULT_PORTFOLIO_ID, { baseCurrency: baseCurrency.trim().toUpperCase() || 'USD' })
        .then(() => {
          setSaving(false);
          setOnboardingDone(true);
        })
        .catch(() => setSaving(false));
    }
  };

  if (step === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome to Stax</Text>
          <Text style={styles.body}>
            Track stocks, crypto, real estate, and more in one place. See your total value and
            allocation at a glance.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGetStarted}>
            <Text style={styles.primaryButtonText}>Get started</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Base currency</Text>
          <Text style={styles.body}>
            Your portfolio values will be shown in this currency (e.g. USD, EUR).
          </Text>
          <TextInput
            style={styles.input}
            placeholder="USD"
            placeholderTextColor={theme.colors.textTertiary}
            value={baseCurrency}
            onChangeText={setBaseCurrency}
            autoCapitalize="characters"
            maxLength={3}
          />
          <TouchableOpacity
            style={[styles.primaryButton, saving && styles.buttonDisabled]}
            onPress={handleGetStarted}
            disabled={saving}
          >
            <Text style={styles.primaryButtonText}>
              {saving ? 'Saving…' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    padding: theme.layout.screenPadding,
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: theme.layout.screenPadding },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.xl,
    maxWidth: 400,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  body: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  input: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  primaryButton: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.md,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.7 },
  primaryButtonText: {
    color: theme.colors.background,
    ...theme.typography.bodyMedium,
  },
});
