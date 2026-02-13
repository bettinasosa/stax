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
import { holdingRepo } from '../../../data';
import { useEntitlements } from '../../analysis/useEntitlements';
import { usePortfolio } from '../../portfolio/usePortfolio';
import { trackHoldingAdded } from '../../../services/analytics';
import { searchSymbols, isFinnhubConfigured, getCompanyProfile } from '../../../services/finnhub';
import type { FinnhubSearchResult } from '../../../services/finnhub';
import { searchCryptoCoins } from '../../../services/coingecko';
import type { CryptoSearchResult } from '../../../services/coingecko';
import { createListedHoldingSchema } from '../../../data/schemas';
import { getLatestPrice } from '../../../services/pricing';
import { FREE_HOLDINGS_LIMIT } from '../../../utils/constants';
import type { AssetTypeListed } from '../../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../../data/db';
import { theme } from '../../../utils/theme';
import { DatePickerField } from '../../../components/ui/DatePickerField';

const METAL_OPTIONS = [
  { symbol: 'XAU', label: 'Gold (XAU)' },
  { symbol: 'XAG', label: 'Silver (XAG)' },
  { symbol: 'XPT', label: 'Platinum (XPT)' },
  { symbol: 'XPD', label: 'Palladium (XPD)' },
];

/** Contextual placeholder for the symbol input based on asset type. */
function getSymbolPlaceholder(type: AssetTypeListed): string {
  switch (type) {
    case 'stock': return 'e.g. AAPL, TSLA';
    case 'etf': return 'e.g. SPY, VTI';
    case 'crypto': return 'Search e.g. BTC, Ethereum, Solana…';
    case 'metal': return 'e.g. XAU, XAG';
    case 'commodity': return 'e.g. CL1! (crude oil)';
    default: return 'e.g. AAPL, BTC';
  }
}

interface ListedAssetFormProps {
  listedType: AssetTypeListed;
  isCryptoManual: boolean;
  onBack: () => void;
}

/**
 * Form for adding a listed asset (stock, ETF, crypto, metal, commodity).
 * Includes symbol search for stocks/ETFs (Finnhub) and crypto (CoinGecko).
 */
export function ListedAssetForm({ listedType, isCryptoManual, onBack }: ListedAssetFormProps) {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { isPro } = useEntitlements();
  const { activePortfolioId, refresh } = usePortfolio();

  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [acquiredDate, setAcquiredDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [enrichedMeta, setEnrichedMeta] = useState<{ country?: string; sector?: string } | null>(null);
  const [cryptoProviderId, setCryptoProviderId] = useState<string | null>(null);

  // Stock/ETF search
  const [symbolSearchResults, setSymbolSearchResults] = useState<FinnhubSearchResult[] | null>(null);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const symbolSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStockOrEtf = listedType === 'stock' || listedType === 'etf';
  const showSymbolSearch = isStockOrEtf && isFinnhubConfigured();

  // Crypto search
  const [cryptoSearchResults, setCryptoSearchResults] = useState<CryptoSearchResult[] | null>(null);
  const [cryptoSearchLoading, setCryptoSearchLoading] = useState(false);
  const cryptoSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stock/ETF symbol search
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
    return () => { if (symbolSearchTimeoutRef.current) clearTimeout(symbolSearchTimeoutRef.current); };
  }, [showSymbolSearch, symbol]);

  // Crypto symbol search
  useEffect(() => {
    if (!isCryptoManual || symbol.trim().length < 1) {
      setCryptoSearchResults(null);
      return;
    }
    if (cryptoSearchTimeoutRef.current) clearTimeout(cryptoSearchTimeoutRef.current);
    cryptoSearchTimeoutRef.current = setTimeout(async () => {
      setCryptoSearchLoading(true);
      setCryptoSearchResults(null);
      try {
        const results = await searchCryptoCoins(symbol.trim());
        setCryptoSearchResults(results);
      } catch {
        // CoinGecko list fetch may fail (rate limit, network); silently ignore
      } finally {
        setCryptoSearchLoading(false);
      }
    }, 300);
    return () => { if (cryptoSearchTimeoutRef.current) clearTimeout(cryptoSearchTimeoutRef.current); };
  }, [isCryptoManual, symbol]);

  const handleSelectStockResult = async (result: FinnhubSearchResult) => {
    const sym = result.displaySymbol || result.symbol;
    setSymbol(sym);
    setAssetName(result.description || '');
    setSymbolSearchResults(null);
    setEnrichedMeta(null);
    try {
      const profile = await getCompanyProfile(sym);
      if (profile) {
        setEnrichedMeta({
          country: profile.country || undefined,
          sector: profile.finnhubIndustry || undefined,
        });
      }
    } catch {
      // Non-critical
    }
  };

  const handleSelectCryptoResult = (result: CryptoSearchResult) => {
    setSymbol(result.symbol);
    setAssetName(result.name);
    setCryptoProviderId(result.id);
    setCryptoSearchResults(null);
  };

  const handleSave = async () => {
    if (!isPro) {
      const count = await holdingRepo.countByPortfolioId(db, activePortfolioId ?? DEFAULT_PORTFOLIO_ID);
      if (count >= FREE_HOLDINGS_LIMIT) {
        (navigation as any).navigate('Paywall', { trigger: `Unlock unlimited holdings — add more than ${FREE_HOLDINGS_LIMIT} positions` });
        return;
      }
    }
    const q = parseFloat(quantity);
    if (!symbol.trim() || isNaN(q) || q <= 0) {
      Alert.alert('Invalid input', 'Symbol and a positive quantity are required.');
      return;
    }
    let metadata: Record<string, string | undefined> | undefined;
    if (enrichedMeta) {
      metadata = { country: enrichedMeta.country, sector: enrichedMeta.sector };
    }
    if (listedType === 'crypto' && cryptoProviderId) {
      metadata = { ...metadata, providerId: cryptoProviderId };
    }
    let acquiredAt: string | undefined;
    if (acquiredDate.trim()) {
      const d = new Date(acquiredDate.trim());
      if (!Number.isNaN(d.getTime())) acquiredAt = d.toISOString();
    }
    const parsed = createListedHoldingSchema.safeParse({
      portfolioId: activePortfolioId ?? DEFAULT_PORTFOLIO_ID,
      type: listedType,
      name: (assetName || symbol).trim(),
      symbol: symbol.trim().toUpperCase(),
      quantity: q,
      costBasis: costBasis ? parseFloat(costBasis) : undefined,
      costBasisCurrency: currency,
      currency,
      acquiredAt,
      metadata,
    });
    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      await holdingRepo.createListed(db, parsed.data);
      await getLatestPrice(db, parsed.data.symbol, listedType, parsed.data.metadata ?? undefined);
      trackHoldingAdded(listedType, true);
      refresh();
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.label}>Symbol</Text>
      {listedType === 'metal' ? (
        <View style={styles.metalPicker}>
          {METAL_OPTIONS.map((m) => {
            const selected = symbol.toUpperCase() === m.symbol;
            return (
              <TouchableOpacity
                key={m.symbol}
                style={[styles.metalOption, selected && styles.metalOptionSelected]}
                onPress={() => { setSymbol(m.symbol); setAssetName(m.label.split(' (')[0]); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.metalOptionText, selected && styles.metalOptionTextSelected]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <>
          <TextInput
            style={styles.input}
            value={symbol}
            onChangeText={(t) => { setSymbol(t); if (!t.trim()) setAssetName(''); }}
            placeholder={getSymbolPlaceholder(listedType)}
            autoCapitalize="characters"
          />
          {showSymbolSearch && symbolSearchLoading && (
            <View style={styles.searchRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.searchHint}>Searching…</Text>
            </View>
          )}
          {showSymbolSearch && symbolSearchResults && symbolSearchResults.length > 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.searchLabel}>Tap to select</Text>
              {symbolSearchResults.slice(0, 8).map((r, i, arr) => (
                <TouchableOpacity
                  key={`${r.symbol}-${r.type}`}
                  style={[styles.searchResultRow, i === arr.length - 1 && styles.searchResultRowLast]}
                  onPress={() => handleSelectStockResult(r)}
                >
                  <Text style={styles.searchResultSymbol}>{r.displaySymbol || r.symbol}</Text>
                  <Text style={styles.searchResultDesc} numberOfLines={1}>{r.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {isCryptoManual && cryptoSearchLoading && (
            <View style={styles.searchRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.searchHint}>Searching tokens…</Text>
            </View>
          )}
          {isCryptoManual && cryptoSearchResults && cryptoSearchResults.length > 0 && (
            <View style={styles.searchResults}>
              <Text style={styles.searchLabel}>Tap to select</Text>
              {cryptoSearchResults.map((r, i, arr) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.searchResultRow, i === arr.length - 1 && styles.searchResultRowLast]}
                  onPress={() => handleSelectCryptoResult(r)}
                >
                  <Text style={styles.searchResultSymbol}>{r.symbol}</Text>
                  <Text style={styles.searchResultDesc} numberOfLines={1}>{r.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {enrichedMeta && (enrichedMeta.country || enrichedMeta.sector) && (
            <View style={styles.enrichedRow}>
              {enrichedMeta.country ? (
                <View style={styles.enrichedBadge}>
                  <Text style={styles.enrichedBadgeText}>{enrichedMeta.country}</Text>
                </View>
              ) : null}
              {enrichedMeta.sector ? (
                <View style={styles.enrichedBadge}>
                  <Text style={styles.enrichedBadgeText}>{enrichedMeta.sector}</Text>
                </View>
              ) : null}
            </View>
          )}
        </>
      )}
      <Text style={styles.label}>Quantity</Text>
      <TextInput
        style={styles.input}
        value={quantity}
        onChangeText={setQuantity}
        placeholder="0"
        keyboardType="decimal-pad"
      />
      <Text style={styles.label}>Cost per unit (optional)</Text>
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
        value={currency}
        onChangeText={setCurrency}
        placeholder="USD"
      />
      <DatePickerField
        label="Date acquired (optional)"
        value={acquiredDate}
        onChange={setAcquiredDate}
        placeholder="Tap to pick date"
      />
      <TouchableOpacity
        style={[styles.button, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.background} />
        ) : (
          <Text style={styles.buttonText}>Save</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: theme.layout.screenPadding },
  label: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm, fontSize: 16, backgroundColor: theme.colors.surface, color: theme.colors.textPrimary,
  },
  button: {
    backgroundColor: theme.colors.white, padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius, alignItems: 'center', marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.background, ...theme.typography.bodyMedium },
  backButton: { marginTop: theme.spacing.sm, alignItems: 'center' },
  backButtonText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  searchHint: { ...theme.typography.caption, color: theme.colors.textSecondary },
  searchResults: {
    marginTop: theme.spacing.xs, padding: theme.spacing.xs,
    backgroundColor: theme.colors.surface, borderRadius: theme.layout.cardRadius,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  searchLabel: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xs,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  searchResultRowLast: { borderBottomWidth: 0 },
  searchResultSymbol: { ...theme.typography.bodyMedium, color: theme.colors.textPrimary, marginRight: theme.spacing.sm },
  searchResultDesc: { flex: 1, ...theme.typography.caption, color: theme.colors.textSecondary },
  enrichedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  enrichedBadge: {
    backgroundColor: theme.colors.accent + '20', paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3, borderRadius: theme.radius.pill, borderWidth: 1, borderColor: theme.colors.accent + '40',
  },
  enrichedBadgeText: { ...theme.typography.small, color: theme.colors.accent },
  metalPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginBottom: theme.spacing.sm },
  metalOption: {
    flexBasis: '47%', backgroundColor: theme.colors.surface, borderWidth: 1.5,
    borderColor: theme.colors.border, borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.sm, alignItems: 'center',
  },
  metalOptionSelected: { borderColor: theme.colors.white },
  metalOptionText: { ...theme.typography.bodySemi, color: theme.colors.textSecondary },
  metalOptionTextSelected: { color: theme.colors.textPrimary },
});
