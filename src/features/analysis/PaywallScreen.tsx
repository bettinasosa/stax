import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useEntitlements } from './useEntitlements';
import { theme } from '../../utils/theme';

interface PaywallScreenProps {
  trigger?: string;
  onDismiss?: () => void;
  onSuccess?: () => void;
}

/**
 * Paywall: Pro value prop, restore purchases, dismiss. Shown when user hits Analysis, 16th holding, or second schedule.
 */
export function PaywallScreen({ trigger, onDismiss, onSuccess }: PaywallScreenProps) {
  const { isPro, loading, restorePurchases } = useEntitlements();
  const [restoring, setRestoring] = useState(false);

  if (loading && !isPro) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  if (isPro) {
    if (onSuccess) onSuccess();
    return null;
  }

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        if (onSuccess) onSuccess();
      } else {
        Alert.alert('Restore', 'No previous purchase found.');
      }
    } catch {
      Alert.alert('Error', 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Stax Pro</Text>
      <Text style={styles.subtitle}>Unlock full portfolio insights</Text>
      <View style={styles.bullets}>
        <Text style={styles.bullet}>• Unlimited holdings</Text>
        <Text style={styles.bullet}>• Analyst sentiment & price targets</Text>
        <Text style={styles.bullet}>• Insider buying/selling signals</Text>
        <Text style={styles.bullet}>• Deep allocation analysis (country, sector, currency)</Text>
        <Text style={styles.bullet}>• Concentration warnings and Stax Score</Text>
        <Text style={styles.bullet}>• Real estate & fixed income analytics</Text>
        <Text style={styles.bullet}>• Unlimited reminder schedules</Text>
      </View>
      {trigger && (
        <Text style={styles.trigger}>You’ve hit a free limit: {trigger}</Text>
      )}
      <TouchableOpacity
        style={[styles.button, restoring && styles.buttonDisabled]}
        onPress={handleRestore}
        disabled={restoring}
      >
        {restoring ? (
          <ActivityIndicator color={theme.colors.background} size="small" />
        ) : (
          <Text style={styles.buttonText}>Restore purchases</Text>
        )}
      </TouchableOpacity>
      {onDismiss && (
        <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
          <Text style={styles.dismissText}>Maybe later</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingTop: theme.spacing.xxl,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
  },
  bullets: { marginBottom: theme.spacing.lg },
  bullet: {
    ...theme.typography.body,
    marginBottom: theme.spacing.xs,
    color: theme.colors.textPrimary,
  },
  trigger: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.lg,
  },
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: {
    color: theme.colors.background,
    ...theme.typography.bodyMedium,
  },
  dismissBtn: { alignItems: 'center', padding: theme.spacing.sm },
  dismissText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
