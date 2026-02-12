import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { backupToCloud, restoreFromCloud, getLastBackupTime } from '../../services/cloudBackup';
import { usePortfolio } from '../portfolio/usePortfolio';
import { theme } from '../../utils/theme';

export function CloudBackupSection() {
  const db = useSQLiteContext();
  const { refresh } = usePortfolio();
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getLastBackupTime().then(setLastBackup);
  }, []);

  const handleBackup = async () => {
    setBacking(true);
    try {
      await backupToCloud(db);
      const time = await getLastBackupTime();
      setLastBackup(time);
      Alert.alert('Backup complete', 'Your portfolio data has been saved to the cloud.');
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : 'Unknown error.');
    } finally {
      setBacking(false);
    }
  };

  const handleRestore = () => {
    Alert.alert(
      'Restore from cloud',
      'This will replace ALL local data with the cloud backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setRestoring(true);
            try {
              await restoreFromCloud(db);
              refresh();
              Alert.alert('Restore complete', 'Your local data has been replaced with the cloud backup.');
            } catch (e) {
              Alert.alert('Restore failed', e instanceof Error ? e.message : 'Unknown error.');
            } finally {
              setRestoring(false);
            }
          },
        },
      ],
    );
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Cloud Backup</Text>
      <Text style={styles.muted}>
        {lastBackup
          ? `Last backup: ${formatDate(lastBackup)}`
          : 'No backup yet. Back up your portfolio to the cloud.'}
      </Text>

      <TouchableOpacity
        style={[styles.button, backing && styles.buttonDisabled]}
        onPress={handleBackup}
        disabled={backing || restoring}
      >
        {backing ? (
          <ActivityIndicator size="small" color={theme.colors.background} />
        ) : (
          <Text style={styles.buttonText}>Back up now</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.buttonDanger, restoring && styles.buttonDisabled]}
        onPress={handleRestore}
        disabled={backing || restoring}
      >
        {restoring ? (
          <ActivityIndicator size="small" color={theme.colors.negative} />
        ) : (
          <Text style={styles.buttonDangerText}>Restore from cloud</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  muted: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  buttonText: {
    color: theme.colors.background,
    ...theme.typography.bodyMedium,
  },
  buttonDanger: {
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.negative,
    marginTop: theme.spacing.xs,
  },
  buttonDangerText: {
    color: theme.colors.negative,
    ...theme.typography.body,
  },
  buttonDisabled: { opacity: 0.6 },
});
