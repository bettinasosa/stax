/**
 * Import holdings from pasted CSV. Parse, preview, then import (respecting FREE_HOLDINGS_LIMIT and Pro).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { holdingRepo } from '../../data';
import { useEntitlements } from '../analysis/useEntitlements';
import { trackCsvImportStarted, trackCsvImportCompleted, trackCsvImportFailed } from '../../services/analytics';
import {
  parseCSVImport,
  listedWithPortfolioId,
  nonListedWithPortfolioId,
  CSV_IMPORT_HEADER,
  CSV_IMPORT_EXAMPLE_LISTED,
  CSV_IMPORT_EXAMPLE_NON_LISTED,
} from '../../services/csvImport';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { FREE_HOLDINGS_LIMIT } from '../../utils/constants';
import { theme } from '../../utils/theme';

export function ImportCSVScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { isPro } = useEntitlements();
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseCSVImport> | null>(null);
  const [importing, setImporting] = useState(false);

  const handlePreview = () => {
    const result = parseCSVImport(csvText);
    setParsed(result);
  };

  const handleImport = async () => {
    if (!parsed) return;
    const total = parsed.listed.length + parsed.nonListed.length;
    if (total === 0) {
      Alert.alert('Nothing to import', 'Parse valid rows first, or fix errors.');
      return;
    }
    const existingCount = await holdingRepo.countByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
    const allowed = isPro ? total : Math.max(0, FREE_HOLDINGS_LIMIT - existingCount);
    if (allowed <= 0) {
      Alert.alert(
        'Limit reached',
        `Free accounts can have up to ${FREE_HOLDINGS_LIMIT} holdings. Upgrade to Pro for unlimited.`
      );
      return;
    }
    const toListed = listedWithPortfolioId(parsed.listed, DEFAULT_PORTFOLIO_ID);
    const toNonListed = nonListedWithPortfolioId(parsed.nonListed, DEFAULT_PORTFOLIO_ID);
    const takeListed = Math.min(toListed.length, allowed);
    const takeNonListed = Math.min(toNonListed.length, Math.max(0, allowed - takeListed));
    const listToAdd = toListed.slice(0, takeListed);
    const nonListToAdd = toNonListed.slice(0, takeNonListed);
    const actuallyAdding = listToAdd.length + nonListToAdd.length;
    if (actuallyAdding < total && !isPro) {
      Alert.alert(
        'Import limit',
        `You can import ${actuallyAdding} of ${total} holdings (free limit: ${FREE_HOLDINGS_LIMIT} total).`
      );
    }
    setImporting(true);
    trackCsvImportStarted();
    try {
      for (const input of listToAdd) {
        await holdingRepo.createListed(db, input);
      }
      for (const input of nonListToAdd) {
        await holdingRepo.createNonListed(db, input);
      }
      trackCsvImportCompleted(actuallyAdding);
      Alert.alert('Import done', `${actuallyAdding} holding(s) added.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      trackCsvImportFailed(message);
      Alert.alert('Import failed', message);
    } finally {
      setImporting(false);
    }
  };

  const totalValid = parsed ? parsed.listed.length + parsed.nonListed.length : 0;
  const hasErrors = parsed && parsed.errors.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>CSV format</Text>
        <Text style={styles.muted}>
          Header (optional): {CSV_IMPORT_HEADER}
        </Text>
        <Text style={styles.small}>Listed example: {CSV_IMPORT_EXAMPLE_LISTED}</Text>
        <Text style={styles.small}>Non-listed example: {CSV_IMPORT_EXAMPLE_NON_LISTED}</Text>
      </View>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Paste your CSV</Text>
        <TextInput
          style={styles.textArea}
          value={csvText}
          onChangeText={(t) => {
            setCsvText(t);
            setParsed(null);
          }}
          placeholder="type,name,symbol,quantity,cost_basis,currency,manual_value,note"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          numberOfLines={6}
        />
        <TouchableOpacity style={styles.buttonSecondary} onPress={handlePreview}>
          <Text style={styles.buttonSecondaryText}>Preview</Text>
        </TouchableOpacity>
      </View>
      {parsed && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <Text style={styles.muted}>
            {parsed.listed.length} listed, {parsed.nonListed.length} non-listed
            {hasErrors ? ` · ${parsed.errors.length} row(s) with errors` : ''}
          </Text>
          {hasErrors && (
            <View style={styles.errorBlock}>
              {parsed.errors.slice(0, 5).map((err, idx) => (
                <Text key={idx} style={styles.errorLine}>
                  Row {err.rowIndex}: {err.message}
                </Text>
              ))}
              {parsed.errors.length > 5 && (
                <Text style={styles.errorLine}>… and {parsed.errors.length - 5} more</Text>
              )}
            </View>
          )}
          {totalValid > 0 && (
            <TouchableOpacity
              style={[styles.button, importing && styles.buttonDisabled]}
              onPress={handleImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator color={theme.colors.background} size="small" />
              ) : (
                <Text style={styles.buttonText}>Import {totalValid} holding(s)</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xl,
  },
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
  small: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: theme.spacing.xs,
  },
  textArea: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.sm,
  },
  button: {
    backgroundColor: theme.colors.white,
    padding: theme.spacing.sm,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    marginTop: theme.spacing.sm,
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
  },
  buttonSecondaryText: {
    color: theme.colors.textPrimary,
    ...theme.typography.body,
  },
  errorBlock: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    marginTop: theme.spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.negative,
  },
  errorLine: {
    ...theme.typography.small,
    color: theme.colors.negative,
    marginBottom: theme.spacing.xs,
  },
});
