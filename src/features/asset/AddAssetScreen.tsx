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
  Animated,
  PanResponder,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute } from '@react-navigation/native';
import { holdingRepo, eventRepo, lotRepo } from '../../data';
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
import { searchSymbols, isFinnhubConfigured, getCompanyProfile } from '../../services/finnhub';
import type { FinnhubSearchResult } from '../../services/finnhub';
import { FREE_HOLDINGS_LIMIT } from '../../utils/constants';
import { createListedHoldingSchema, createNonListedHoldingSchema, buildAssetId } from '../../data/schemas';
import { getLatestPrice } from '../../services/pricing';
import { buildLotsFromChain } from '../../services/costBasisFromChain';
import {
  ASSET_TYPE_LISTED,
  ASSET_TYPE_NON_LISTED,
  ASSET_TYPES,
  EVENT_KINDS,
  DEFAULT_REMIND_DAYS_BEFORE,
} from '../../utils/constants';
import type { AssetType, AssetTypeListed, AssetTypeNonListed } from '../../utils/constants';
import type { EventKind } from '../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { usePortfolio } from '../portfolio/usePortfolio';
import { theme } from '../../utils/theme';

type Flow = 'listed' | 'non_listed' | null;
type ListedCryptoSubFlow = 'manual' | 'wallet_import' | null;

/** Display order and labels for asset type buttons. */
const ASSET_TYPE_BUTTONS: { type: AssetType; label: string }[] = [
  { type: 'stock', label: 'Stock' },
  { type: 'etf', label: 'ETF' },
  { type: 'crypto', label: 'Crypto' },
  { type: 'metal', label: 'Metal' },
  { type: 'commodity', label: 'Commodity' },
  { type: 'real_estate', label: 'Real Estate' },
  { type: 'cash', label: 'Cash' },
  { type: 'fixed_income', label: 'Fixed Income' },
  { type: 'other', label: 'Other' },
];

const WALLET_SWIPE_ACTIVATION = 12;
const WALLET_SWIPE_DELETE_THRESHOLD = 72;
const WALLET_DELETE_WIDTH = 96;
const WALLET_SWIPE_MAX = WALLET_DELETE_WIDTH + 24;
const WALLET_QUANTITY_SMALL = 1e-6;
const WALLET_FOOTER_HEIGHT = 72;

function formatWalletQuantity(value: number): string {
  return value < WALLET_QUANTITY_SMALL ? value.toExponential(2) : value.toLocaleString();
}

interface WalletHoldingRowProps {
  holding: WalletHolding;
  onRemove: (id: string) => void;
}

function WalletHoldingRow({ holding, onRemove }: WalletHoldingRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const removeRow = () => {
    Animated.timing(translateX, {
      toValue: -WALLET_SWIPE_MAX,
      duration: 160,
      useNativeDriver: true,
    }).start(() => onRemove(holding.id));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > WALLET_SWIPE_ACTIVATION &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx > 0) return;
        const next = Math.max(gesture.dx, -WALLET_SWIPE_MAX);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -WALLET_SWIPE_DELETE_THRESHOLD) {
          removeRow();
        } else {
          resetPosition();
        }
      },
      onPanResponderTerminate: resetPosition,
    })
  ).current;

  return (
    <View style={styles.walletRowWrapper}>
      <View style={styles.walletRowDelete}>
        <Text style={styles.walletRowDeleteText}>Remove</Text>
      </View>
      <Animated.View
        style={[styles.walletRow, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.walletRowText}>
          <Text style={styles.walletSymbol}>{holding.symbol}</Text>
          {holding.name && holding.name !== holding.symbol ? (
            <Text style={styles.walletName} numberOfLines={1}>
              {holding.name}
            </Text>
          ) : null}
        </View>
        <Text style={styles.walletQuantity}>{formatWalletQuantity(holding.quantity)}</Text>
      </Animated.View>
    </View>
  );
}

/**
 * Add Asset: choose listed vs non-listed, then fill form and save.
 */
type AddAssetRouteParams = { initialType?: AssetType };

export function AddAssetScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const route = useRoute();
  const initialTypeParam = (route.params as AddAssetRouteParams | undefined)?.initialType;
  const { isPro } = useEntitlements();
  const { activePortfolioId } = usePortfolio();

  const [flow, setFlow] = useState<Flow>(() => {
    if (initialTypeParam && ASSET_TYPES.includes(initialTypeParam)) {
      return ASSET_TYPE_LISTED.includes(initialTypeParam as AssetTypeListed) ? 'listed' : 'non_listed';
    }
    return null;
  });
  const [saving, setSaving] = useState(false);

  const [listedType, setListedType] = useState<AssetTypeListed>(() => {
    if (initialTypeParam && ASSET_TYPE_LISTED.includes(initialTypeParam as AssetTypeListed)) {
      return initialTypeParam as AssetTypeListed;
    }
    return 'stock';
  });
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [listedCurrency, setListedCurrency] = useState('USD');

  const [nonListedType, setNonListedType] = useState<AssetTypeNonListed>(() => {
    if (initialTypeParam && ASSET_TYPE_NON_LISTED.includes(initialTypeParam as AssetTypeNonListed)) {
      return initialTypeParam as AssetTypeNonListed;
    }
    return 'cash';
  });
  const [name, setName] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [nonListedCurrency, setNonListedCurrency] = useState('USD');
  const [eventKind, setEventKind] = useState<EventKind | ''>('');
  const [eventDate, setEventDate] = useState('');
  const [remindDaysBefore, setRemindDaysBefore] = useState(String(DEFAULT_REMIND_DAYS_BEFORE));

  // Fixed Income metadata
  const [couponRate, setCouponRate] = useState('');
  const [issuer, setIssuer] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [yieldToMaturity, setYieldToMaturity] = useState('');
  const [creditRating, setCreditRating] = useState('');
  const [faceValue, setFaceValue] = useState('');

  // Real Estate metadata
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [rentalIncome, setRentalIncome] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');

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
  const [enrichedMeta, setEnrichedMeta] = useState<{ country?: string; sector?: string } | null>(null);

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

  const handleSelectSymbolSearchResult = async (result: FinnhubSearchResult) => {
    const sym = result.displaySymbol || result.symbol;
    setSymbol(sym);
    setListedAssetName(result.description || '');
    setSymbolSearchResults(null);
    // Auto-enrich: fetch company profile for country + sector
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
      // Non-critical — user can still save without metadata
    }
  };

  const handleSaveListed = async () => {
    if (!isPro) {
      const count = await holdingRepo.countByPortfolioId(db, activePortfolioId ?? DEFAULT_PORTFOLIO_ID);
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
    const metadata = enrichedMeta
      ? { country: enrichedMeta.country, sector: enrichedMeta.sector }
      : undefined;
    const parsed = createListedHoldingSchema.safeParse({
      portfolioId: activePortfolioId ?? DEFAULT_PORTFOLIO_ID,
      type: listedType,
      name: (listedAssetName || symbol).trim(),
      symbol: symbol.trim().toUpperCase(),
      quantity: q,
      costBasis: costBasis ? parseFloat(costBasis) : undefined,
      costBasisCurrency: listedCurrency,
      currency: listedCurrency,
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

  const handleRemoveWalletHolding = (id: string) => {
    setWalletHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const handleConfirmWalletImport = async () => {
    if (walletHoldings.length === 0) return;
    const existingHoldings = await holdingRepo.getByPortfolioId(db, activePortfolioId ?? DEFAULT_PORTFOLIO_ID);
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
    const createdHoldings: { id: string; metadata?: { contractAddress?: string; network?: string } }[] = [];
    try {
      for (const h of toImport) {
        const metadata = h.contractAddress
          ? { contractAddress: h.contractAddress, network: 'ethereum' }
          : undefined;
        const parsed = createListedHoldingSchema.safeParse({
          portfolioId: activePortfolioId ?? DEFAULT_PORTFOLIO_ID,
          type: 'crypto' as const,
          name: h.name || h.symbol,
          symbol: h.symbol,
          quantity: h.quantity,
          costBasis: undefined,
          costBasisCurrency: undefined,
          currency: 'USD',
          metadata,
        });
        if (!parsed.success) {
          failed.push(h.symbol);
          continue;
        }
        try {
          const created = await holdingRepo.createListed(db, parsed.data);
          createdHoldings.push({ id: created.id, metadata: created.metadata });
          await getLatestPrice(db, parsed.data.symbol, 'crypto', parsed.data.metadata ?? undefined);
          trackHoldingAdded('crypto', true);
        } catch {
          failed.push(h.symbol);
        }
      }
      trackWalletImportCompleted(toImport.length - failed.length);

      if (createdHoldings.length > 0 && walletAddress.trim()) {
        const chainId = 1;
        const holdingIdByAssetId = new Map<string, string>();
        for (const { id, metadata } of createdHoldings) {
          const assetId = buildAssetId(chainId, metadata?.contractAddress);
          holdingIdByAssetId.set(assetId, id);
        }
        try {
          const { lots, unpricedCount } = await buildLotsFromChain({
            walletAddress: walletAddress.trim(),
            chainId,
            platform: 'ethereum',
            holdingIdByAssetId,
          });
          if (lots.length > 0) {
            await lotRepo.createMany(db, lots);
            for (const hid of Array.from(new Set(lots.map((l) => l.holdingId)))) {
              const holdingLots = await lotRepo.getByHoldingId(db, hid);
              const agg = lotRepo.aggregateLotsCost(holdingLots);
              if (agg) {
                await holdingRepo.update(db, hid, {
                  costBasis: Math.round(agg.costBasisUsdPerUnit * 1e8) / 1e8,
                  costBasisCurrency: 'USD',
                });
              }
            }
            const unpricedMsg = unpricedCount > 0 ? ` ${unpricedCount} unpriced (set manually).` : '';
            Alert.alert(
              'Import completed',
              `Cost basis: ${lots.length} lots.${unpricedMsg}`,
              [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
            return;
          }
        } catch (_costBasisErr) {
          // Cost basis not computed; continue to show import result
        }
      }

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
      const count = await holdingRepo.countByPortfolioId(db, activePortfolioId ?? DEFAULT_PORTFOLIO_ID);
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

    // Build metadata based on asset type
    let metadata: Record<string, unknown> | undefined = undefined;

    if (nonListedType === 'fixed_income') {
      metadata = {};
      if (couponRate) metadata.couponRate = parseFloat(couponRate);
      if (issuer) metadata.issuer = issuer.trim();
      if (maturityDate) {
        const d = new Date(maturityDate.trim());
        if (!isNaN(d.getTime())) metadata.maturityDate = d.toISOString();
      }
      if (yieldToMaturity) metadata.yieldToMaturity = parseFloat(yieldToMaturity);
      if (creditRating) metadata.creditRating = creditRating.trim();
      if (faceValue) metadata.faceValue = parseFloat(faceValue);
      if (Object.keys(metadata).length === 0) metadata = undefined;
    }

    if (nonListedType === 'real_estate') {
      metadata = {};
      if (address) metadata.address = address.trim();
      if (propertyType) metadata.propertyType = propertyType.trim();
      if (rentalIncome) metadata.rentalIncome = parseFloat(rentalIncome);
      if (purchasePrice) metadata.purchasePrice = parseFloat(purchasePrice);
      if (purchaseDate) {
        const d = new Date(purchaseDate.trim());
        if (!isNaN(d.getTime())) metadata.purchaseDate = d.toISOString();
      }
      if (Object.keys(metadata).length === 0) metadata = undefined;
    }

    const parsed = createNonListedHoldingSchema.safeParse({
      portfolioId: activePortfolioId ?? DEFAULT_PORTFOLIO_ID,
      type: nonListedType,
      name: name.trim(),
      manualValue: val,
      currency: nonListedCurrency,
      metadata,
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

  const selectType = (type: AssetType) => {
    if (ASSET_TYPE_LISTED.includes(type as AssetTypeListed)) {
      setFlow('listed');
      setListedType(type as AssetTypeListed);
      setListedCryptoSubFlow(type === 'crypto' ? 'manual' : null);
    } else {
      setFlow('non_listed');
      setNonListedType(type as AssetTypeNonListed);
    }
  };

  if (flow === null) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Add Asset</Text>
        <Text style={styles.typeSubtitle}>Choose asset type</Text>
        <View style={styles.typeButtonGrid}>
          {ASSET_TYPE_BUTTONS.map(({ type, label }) => (
            <TouchableOpacity
              key={type}
              style={styles.typeButton}
              onPress={() => selectType(type)}
            >
              <Text style={styles.typeButtonText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (flow === 'listed') {
    const isCrypto = listedType === 'crypto';
    const showCryptoChoice = isCrypto && listedCryptoSubFlow === null;
    const showWalletImport = isCrypto && listedCryptoSubFlow === 'wallet_import';

    if (showCryptoChoice) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
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
      const hasHoldings = walletHoldings.length > 0;
      return (
        <View style={styles.container}>
          <ScrollView
            style={styles.walletScroll}
            contentContainerStyle={[
              styles.scrollContent,
              hasHoldings && styles.scrollContentWithFooter,
            ]}
          >
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
            {hasHoldings ? (
              <>
                <Text style={styles.sectionLabel}>
                  Found {walletHoldings.length} holding{walletHoldings.length !== 1 ? 's' : ''}
                </Text>
                <Text style={styles.walletNote}>
                  Tokens already in your portfolio will be skipped. Swipe left to remove.
                </Text>
                {walletHoldings.map((h) => (
                  <WalletHoldingRow
                    key={h.id}
                    holding={h}
                    onRemove={handleRemoveWalletHolding}
                  />
                ))}
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
          {hasHoldings ? (
            <View style={styles.walletFooter}>
              <TouchableOpacity
                style={[styles.floatingButton, walletImporting && styles.buttonDisabled]}
                onPress={handleConfirmWalletImport}
                disabled={walletImporting}
              >
                {walletImporting ? (
                  <ActivityIndicator color={theme.colors.background} />
                ) : (
                  <Text style={styles.buttonText}>
                    Add {walletHoldings.length} token{walletHoldings.length !== 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
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

      {nonListedType === 'fixed_income' && (
        <>
          <Text style={styles.sectionLabel}>Fixed Income Details (optional)</Text>

          <Text style={styles.label}>Coupon Rate (%)</Text>
          <TextInput
            style={styles.input}
            value={couponRate}
            onChangeText={setCouponRate}
            placeholder="4.5"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Issuer</Text>
          <TextInput
            style={styles.input}
            value={issuer}
            onChangeText={setIssuer}
            placeholder="e.g., US Treasury, Apple Inc."
          />

          <Text style={styles.label}>Maturity Date</Text>
          <TextInput
            style={styles.input}
            value={maturityDate}
            onChangeText={setMaturityDate}
            placeholder="YYYY-MM-DD"
          />

          <Text style={styles.label}>Yield to Maturity (%)</Text>
          <TextInput
            style={styles.input}
            value={yieldToMaturity}
            onChangeText={setYieldToMaturity}
            placeholder="3.8"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Credit Rating</Text>
          <TextInput
            style={styles.input}
            value={creditRating}
            onChangeText={setCreditRating}
            placeholder="e.g., AAA, BB+"
          />

          <Text style={styles.label}>Face Value</Text>
          <TextInput
            style={styles.input}
            value={faceValue}
            onChangeText={setFaceValue}
            placeholder="1000"
            keyboardType="decimal-pad"
          />
        </>
      )}

      {nonListedType === 'real_estate' && (
        <>
          <Text style={styles.sectionLabel}>Real Estate Details (optional)</Text>

          <Text style={styles.label}>Property Address</Text>
          <TextInput
            style={styles.input}
            value={address}
            onChangeText={setAddress}
            placeholder="123 Main St, City, State"
          />

          <Text style={styles.label}>Property Type</Text>
          <TextInput
            style={styles.input}
            value={propertyType}
            onChangeText={setPropertyType}
            placeholder="e.g., Residential, Commercial"
          />

          <Text style={styles.label}>Monthly Rental Income</Text>
          <TextInput
            style={styles.input}
            value={rentalIncome}
            onChangeText={setRentalIncome}
            placeholder="2500"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Purchase Price</Text>
          <TextInput
            style={styles.input}
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            placeholder="500000"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Purchase Date</Text>
          <TextInput
            style={styles.input}
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
          />
        </>
      )}

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
  typeSubtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  typeButtonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  typeButton: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.layout.cardRadius,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 100,
  },
  typeButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  scrollContentWithFooter: {
    paddingBottom: theme.spacing.lg + WALLET_FOOTER_HEIGHT,
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
  walletScroll: { flex: 1 },
  walletFooter: {
    position: 'absolute',
    left: theme.layout.screenPadding,
    right: theme.layout.screenPadding,
    bottom: theme.spacing.lg,
  },
  floatingButton: {
    backgroundColor: theme.colors.white,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  walletRowWrapper: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
  },
  walletRowDelete: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: WALLET_DELETE_WIDTH,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: theme.spacing.xs,
  },
  walletRowDeleteText: {
    ...theme.typography.caption,
    color: theme.colors.white,
  },
  walletRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  walletRowText: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  walletSymbol: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  walletName: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
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
  enrichedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  enrichedBadge: {
    backgroundColor: theme.colors.accent + '20',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent + '40',
  },
  enrichedBadgeText: {
    ...theme.typography.small,
    color: theme.colors.accent,
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
