import React, { useState, useEffect, useRef } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { holdingRepo, eventRepo } from '../../data';
import { scheduleEventNotification } from '../../services/notifications';
import { useEntitlements } from '../analysis/useEntitlements';
import {
  trackHoldingAdded,
  trackEventCreated,
  trackWalletImportStarted,
  trackWalletImportCompleted,
  trackWalletImportFailed,
} from '../../services/analytics';
import { fetchWalletHoldings, isValidEthereumAddress } from '../../services/ethplorer';
import type { WalletHolding } from '../../services/ethplorer';
import { searchSymbols, isFinnhubConfigured } from '../../services/finnhub';
import type { FinnhubSearchResult } from '../../services/finnhub';
import { FREE_HOLDINGS_LIMIT } from '../../utils/constants';
import { createListedHoldingSchema, createNonListedHoldingSchema } from '../../data/schemas';
import { getLatestPrice } from '../../services/pricing';
import { ASSET_TYPE_LISTED, ASSET_TYPE_NON_LISTED, EVENT_KINDS, DEFAULT_REMIND_DAYS_BEFORE } from '../../utils/constants';
import type { AssetTypeListed, AssetTypeNonListed } from '../../utils/constants';
import type { EventKind } from '../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { theme } from '../../utils/theme';

type Flow = 'listed' | 'non_listed' | null;
type ListedCryptoSubFlow = 'manual' | 'wallet_import' | null;

/**
 * Add Asset: choose listed vs non-listed, then fill form and save.
 */
export function AddAssetScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { isPro } = useEntitlements();
  const [flow, setFlow] = useState<Flow>(null);
  const [saving, setSaving] = useState(false);

  const [listedType, setListedType] = useState<AssetTypeListed>('stock');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [listedCurrency, setListedCurrency] = useState('USD');

  const [nonListedType, setNonListedType] = useState<AssetTypeNonListed>('cash');
  const [name, setName] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [nonListedCurrency, setNonListedCurrency] = useState('USD');
  const [eventKind, setEventKind] = useState<EventKind | ''>('');
  const [eventDate, setEventDate] = useState('');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(DEFAULT_REMIND_DAYS_BEFORE));

  const [listedCryptoSubFlow, setListedCryptoSubFlow] = useState<ListedCryptoSubFlow>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [walletHoldings, setWalletHoldings] = useState<WalletHolding[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletImporting, setWalletImporting] = useState(false);

  const [symbolSearchResults, setSymbolSearchResults] = useState<FinnhubSearchResult[] | null>(null);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const symbolSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [listedAssetName, setListedAssetName] = useState('');

  const isStockOrEtf = listedType === 'stock' || listedType === 'etf';
  const showSymbolSearch = isStockOrEtf && isFinnhubConfigured();

  useEffect(() => {
    if (!showSymbolSearch || symbol.trim().length < 2) {
      setSymbolSearchResults(null);
      return;
    }
    if (symbolSearchTimeoutRef.current) clearTimeout(symbolSearchTimeoutRef.current);
    symbolSearchTimeoutRef.current = setTimeout(async () => {
      setSymbolSearchLoading(true);
      setSymbolSearchResults(null);
      try {
        const results = await searchSymbols(symbol.trim());
        setSymbolSearchResults(results);
      } finally {
        setSymbolSearchLoading(false);
      }
    }, 400);
    return () => {
      if (symbolSearchTimeoutRef.current) clearTimeout(symbolSearchTimeoutRef.current);
    };
  }, [showSymbolSearch, symbol]);

  const handleSelectSymbolSearchResult = (result: FinnhubSearchResult) => {
    setSymbol(result.displaySymbol || result.symbol);
    setListedAssetName(result.description || '');
    setSymbolSearchResults(null);
  };

  const handleSaveListed = async () => {
    if (!isPro) {
      const count = await holdingRepo.countByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
      if (count >= FREE_HOLDINGS_LIMIT) {
        Alert.alert(
          'Limit reached',
          `Free accounts can have up to ${FREE_HOLDINGS_LIMIT} holdings. Upgrade to Pro for unlimited holdings.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }
    const q = parseFloat(quantity);
    if (!symbol.trim() || isNaN(q) || q <= 0) {
      Alert.alert('Invalid input', 'Symbol and a positive quantity are required.');
      return;
    }
    const parsed = createListedHoldingSchema.safeParse({
      portfolioId: DEFAULT_PORTFOLIO_ID,
      type: listedType,
      name: (listedAssetName || symbol).trim(),
      symbol: symbol.trim().toUpperCase(),
      quantity: q,
      costBasis: costBasis ? parseFloat(costBasis) : undefined,
      costBasisCurrency: listedCurrency,
      currency: listedCurrency,
    });
    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      await holdingRepo.createListed(db, parsed.data);
      await getLatestPrice(db, parsed.data.symbol, listedType);
      trackHoldingAdded(listedType, true);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleFetchWallet = async () => {
    if (!walletAddress.trim()) {
      setWalletError('Enter an Ethereum address');
      return;
    }
    if (!isValidEthereumAddress(walletAddress.trim())) {
      setWalletError('Invalid Ethereum address (use 0x + 40 hex characters)');
      return;
    }
    setWalletError(null);
    setWalletHoldings([]);
    setWalletLoading(true);
    trackWalletImportStarted();
    try {
      const holdings = await fetchWalletHoldings(walletAddress.trim());
      setWalletHoldings(holdings);
      if (holdings.length === 0) {
        setWalletError('No tokens found for this address');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch wallet';
      setWalletError(message);
      trackWalletImportFailed(message);
    } finally {
      setWalletLoading(false);
    }
  };

  const handleConfirmWalletImport = async () => {
    if (walletHoldings.length === 0) return;
    const existingHoldings = await holdingRepo.getByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
    const existingSymbols = new Set(
      existingHoldings
        .filter((h) => h.type === 'crypto' && h.symbol)
        .map((h) => h.symbol!.toUpperCase())
    );
    const newOnly = walletHoldings.filter((h) => !existingSymbols.has(h.symbol.toUpperCase()));
    if (newOnly.length === 0) {
      Alert.alert(
        'No new tokens',
        'All tokens from this address are already in your portfolio.',
        [{ text: 'OK' }]
      );
      return;
    }
    const count = existingHoldings.length;
    const allowed = isPro ? newOnly.length : Math.max(0, FREE_HOLDINGS_LIMIT - count);
    if (allowed <= 0) {
      Alert.alert(
        'Limit reached',
        `Free accounts can have up to ${FREE_HOLDINGS_LIMIT} holdings. Upgrade to Pro for unlimited holdings.`,
        [{ text: 'OK' }]
      );
      return;
    }
    const toImport = newOnly.slice(0, allowed);
    if (!isPro && toImport.length < newOnly.length) {
      Alert.alert(
        'Import limit',
        `You can import up to ${toImport.length} of ${newOnly.length} new holdings (free limit: ${FREE_HOLDINGS_LIMIT} total).`,
        [{ text: 'OK' }]
      );
    }
    setWalletImporting(true);
    const failed: string[] = [];
    try {
      for (const h of toImport) {
        const parsed = createListedHoldingSchema.safeParse({
          portfolioId: DEFAULT_PORTFOLIO_ID,
          type: 'crypto' as const,
          name: h.symbol,
          symbol: h.symbol,
          quantity: h.quantity,
          costBasis: undefined,
          costBasisCurrency: undefined,
          currency: 'USD',
        });
        if (!parsed.success) {
          failed.push(h.symbol);
          continue;
        }
        try {
          await holdingRepo.createListed(db, parsed.data);
          await getLatestPrice(db, parsed.data.symbol, 'crypto');
          trackHoldingAdded('crypto', true);
        } catch {
          failed.push(h.symbol);
        }
      }
      trackWalletImportCompleted(toImport.length - failed.length);
      if (failed.length > 0) {
        Alert.alert('Import completed with errors', `Failed to add: ${failed.join(', ')}`, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        navigation.goBack();
      }
    } finally {
      setWalletImporting(false);
    }
  };

  const handleSaveNonListed = async () => {
    if (!isPro) {
      const count = await holdingRepo.countByPortfolioId(db, DEFAULT_PORTFOLIO_ID);
      if (count >= FREE_HOLDINGS_LIMIT) {
        Alert.alert(
          'Limit reached',
          `Free accounts can have up to ${FREE_HOLDINGS_LIMIT} holdings. Upgrade to Pro for unlimited holdings.`,
          [{ text: 'OK' }]
        );
        return;
      }
    }
    const val = parseFloat(manualValue);
    if (!name.trim() || isNaN(val) || val < 0) {
      Alert.alert('Invalid input', 'Name and a non-negative value are required.');
      return;
    }
    const parsed = createNonListedHoldingSchema.safeParse({
      portfolioId: DEFAULT_PORTFOLIO_ID,
      type: nonListedType,
      name: name.trim(),
      manualValue: val,
      currency: nonListedCurrency,
    });
    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      const holding = await holdingRepo.createNonListed(db, parsed.data);
      trackHoldingAdded(nonListedType, false);
      if (eventKind && eventDate.trim()) {
        const date = new Date(eventDate.trim());
        if (!Number.isNaN(date.getTime())) {
          const created = await eventRepo.create(db, {
            holdingId: holding.id,
            kind: eventKind as EventKind,
            date: date.toISOString(),
            remindDaysBefore: parseInt(remindDaysBefore, 10) || DEFAULT_REMIND_DAYS_BEFORE,
          });
          await scheduleEventNotification(created);
          trackEventCreated();
        }
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (flow === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Add Asset</Text>
        <TouchableOpacity
          style={styles.option}
          onPress={() => setFlow('listed')}
        >
          <Text style={styles.optionText}>Listed (Stock, ETF, Crypto, Metal)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.option}
          onPress={() => setFlow('non_listed')}
        >
          <Text style={styles.optionText}>Non-listed (Fixed income, Real estate, Cash, Other)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (flow === 'listed') {
    const isCrypto = listedType === 'crypto';
    const showCryptoChoice = isCrypto && listedCryptoSubFlow === null;
    const showWalletImport = isCrypto && listedCryptoSubFlow === 'wallet_import';

    if (showCryptoChoice) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.row}>
            {(ASSET_TYPE_LISTED as readonly string[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, listedType === t && styles.chipActive]}
                onPress={() => setListedType(t as AssetTypeListed)}
              >
                <Text style={listedType === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionLabel}>Add crypto</Text>
          <TouchableOpacity
            style={styles.option}
            onPress={() => setListedCryptoSubFlow('manual')}
          >
            <Text style={styles.optionText}>Add manually (symbol, quantity, etc.)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => setListedCryptoSubFlow('wallet_import')}
          >
            <Text style={styles.optionText}>Import from Ethereum wallet address</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => setFlow(null)}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    if (showWalletImport) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.title}>Import from wallet</Text>
          <Text style={styles.label}>Ethereum address</Text>
          <TextInput
            style={styles.input}
            value={walletAddress}
            onChangeText={(text) => {
              setWalletAddress(text);
              setWalletError(null);
            }}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect={false}
            editable={!walletLoading}
          />
          {walletError ? <Text style={styles.errorText}>{walletError}</Text> : null}
          <TouchableOpacity
            style={[styles.button, walletLoading && styles.buttonDisabled]}
            onPress={handleFetchWallet}
            disabled={walletLoading}
          >
            {walletLoading ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={styles.buttonText}>Fetch holdings</Text>
            )}
          </TouchableOpacity>
          {walletHoldings.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>
                Found {walletHoldings.length} holding{walletHoldings.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.walletNote}>
                Tokens already in your portfolio will be skipped.
              </Text>
              {walletHoldings.map((h, i) => (
                <View key={`${h.symbol}-${i}`} style={styles.walletRow}>
                  <Text style={styles.walletSymbol}>{h.symbol}</Text>
                  <Text style={styles.walletQuantity}>
                    {h.quantity < 1e-6 ? h.quantity.toExponential(2) : h.quantity.toLocaleString()}
                  </Text>
                </View>
              ))}
              <TouchableOpacity
                style={[styles.button, walletImporting && styles.buttonDisabled]}
                onPress={handleConfirmWalletImport}
                disabled={walletImporting}
              >
                {walletImporting ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <Text style={styles.buttonText}>Import {walletHoldings.length} holdings</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              setListedCryptoSubFlow(null);
              setWalletAddress('');
              setWalletHoldings([]);
              setWalletError(null);
            }}
          >
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.label}>Type</Text>
        <View style={styles.row}>
          {(ASSET_TYPE_LISTED as readonly string[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.chip, listedType === t && styles.chipActive]}
              onPress={() => {
                setListedType(t as AssetTypeListed);
                setListedCryptoSubFlow(null);
                setSymbolSearchResults(null);
                setListedAssetName('');
              }}
            >
              <Text style={listedType === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Symbol</Text>
        <TextInput
          style={styles.input}
          value={symbol}
          onChangeText={(t) => {
            setSymbol(t);
            if (!t.trim()) setListedAssetName('');
          }}
          placeholder="e.g. AAPL, BTC"
          autoCapitalize="characters"
        />
        {showSymbolSearch && symbolSearchLoading && (
          <View style={styles.searchResultsRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.searchResultsHint}>Searching…</Text>
          </View>
        )}
        {showSymbolSearch && symbolSearchResults && symbolSearchResults.length > 0 && (
          <View style={styles.searchResults}>
            <Text style={styles.searchResultsLabel}>Tap to select</Text>
            {symbolSearchResults.slice(0, 8).map((r, i, arr) => (
              <TouchableOpacity
                key={`${r.symbol}-${r.type}`}
                style={[styles.searchResultRow, i === arr.length - 1 && styles.searchResultRowLast]}
                onPress={() => handleSelectSymbolSearchResult(r)}
              >
                <Text style={styles.searchResultSymbol}>{r.displaySymbol || r.symbol}</Text>
                <Text style={styles.searchResultDesc} numberOfLines={1}>{r.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.label}>Quantity</Text>
        <TextInput
          style={styles.input}
          value={quantity}
          onChangeText={setQuantity}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Cost basis (optional)</Text>
        <TextInput
          style={styles.input}
          value={costBasis}
          onChangeText={setCostBasis}
          placeholder="0"
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Currency</Text>
        <TextInput
          style={styles.input}
          value={listedCurrency}
          onChangeText={setListedCurrency}
          placeholder="USD"
        />
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSaveListed}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.background} />
          ) : (
            <Text style={styles.buttonText}>Save</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => (isCrypto ? setListedCryptoSubFlow(null) : setFlow(null))}
        >
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.label}>Type</Text>
      <View style={styles.row}>
        {(ASSET_TYPE_NON_LISTED as readonly string[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.chip, nonListedType === t && styles.chipActive]}
            onPress={() => setNonListedType(t as AssetTypeNonListed)}
          >
            <Text style={nonListedType === t ? styles.chipTextActive : styles.chipText}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Savings account"
      />
      <Text style={styles.label}>Current value</Text>
      <TextInput
        style={styles.input}
        value={manualValue}
        onChangeText={setManualValue}
        placeholder="0"
        keyboardType="decimal-pad"
      />
      <Text style={styles.label}>Currency</Text>
      <TextInput
        style={styles.input}
        value={nonListedCurrency}
        onChangeText={setNonListedCurrency}
        placeholder="USD"
      />
      <Text style={styles.sectionLabel}>Optional: Add event (maturity, reminder, etc.)</Text>
      <Text style={styles.label}>Event type</Text>
      <View style={styles.row}>
        {(EVENT_KINDS as readonly string[]).map((k) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, eventKind === k && styles.chipActive]}
            onPress={() => setEventKind(eventKind === k ? '' : (k as EventKind))}
          >
            <Text style={eventKind === k ? styles.chipTextActive : styles.chipText}>
              {k.replace(/_/g, ' ')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {eventKind ? (
        <>
          <Text style={styles.label}>Event date</Text>
          <TextInput
            style={styles.input}
            value={eventDate}
            onChangeText={setEventDate}
            placeholder="YYYY-MM-DD"
          />
          <Text style={styles.label}>Remind me (days before)</Text>
          <TextInput
            style={styles.input}
            value={remindDaysBefore}
            onChangeText={setRemindDaysBefore}
            placeholder="3"
            keyboardType="number-pad"
          />
        </>
      ) : null}
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSaveNonListed}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={() => setFlow(null)}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
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
  option: {
    padding: theme.layout.screenPadding,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    marginBottom: theme.spacing.sm,
  },
  optionText: { ...theme.typography.body, color: theme.colors.textPrimary },
  backButton: { marginTop: theme.spacing.sm, alignItems: 'center' },
  backButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  sectionLabel: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  walletNote: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  errorText: {
    ...theme.typography.caption,
    color: theme.colors.error,
    marginTop: theme.spacing.xs,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    marginTop: theme.spacing.xs,
  },
  walletSymbol: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  walletQuantity: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  searchResultsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  searchResultsHint: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  searchResults: {
    marginTop: theme.spacing.xs,
    padding: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchResultsLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchResultRowLast: {
    borderBottomWidth: 0,
  },
  searchResultSymbol: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginRight: theme.spacing.sm,
  },
  searchResultDesc: {
    flex: 1,
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
});
