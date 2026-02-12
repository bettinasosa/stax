import React, { useState } from 'react';
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
import { holdingRepo, lotRepo } from '../../../data';
import { useEntitlements } from '../../analysis/useEntitlements';
import { usePortfolio } from '../../portfolio/usePortfolio';
import {
  trackHoldingAdded,
  trackWalletImportStarted,
  trackWalletImportCompleted,
  trackWalletImportFailed,
} from '../../../services/analytics';
import { fetchWalletHoldings, isValidEthereumAddress } from '../../../services/ethplorer';
import type { WalletHolding } from '../../../services/ethplorer';
import { createListedHoldingSchema, buildAssetId } from '../../../data/schemas';
import { getLatestPrice, resolveUnderlyingSymbol } from '../../../services/pricing';
import { buildLotsFromChain } from '../../../services/costBasisFromChain';
import { FREE_HOLDINGS_LIMIT } from '../../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../../data/db';
import { WalletHoldingRow } from './WalletHoldingRow';
import { theme } from '../../../utils/theme';

const WALLET_FOOTER_HEIGHT = 72;

interface WalletImportFormProps {
  onBack: () => void;
}

/** Form for importing crypto holdings from an Ethereum wallet address. */
export function WalletImportForm({ onBack }: WalletImportFormProps) {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const { isPro } = useEntitlements();
  const { activePortfolioId, refresh } = usePortfolio();

  const [walletAddress, setWalletAddress] = useState('');
  const [walletHoldings, setWalletHoldings] = useState<WalletHolding[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [walletImporting, setWalletImporting] = useState(false);

  const handleFetchWallet = async () => {
    const addr = walletAddress.trim();
    if (!isValidEthereumAddress(addr)) {
      setWalletError('Enter a valid Ethereum address (0x…)');
      return;
    }
    setWalletLoading(true);
    setWalletError(null);
    setWalletHoldings([]);
    trackWalletImportStarted();
    try {
      const holdings = await fetchWalletHoldings(addr);
      if (holdings.length === 0) {
        setWalletError('No token balances found for this address.');
      } else {
        setWalletHoldings(holdings);
      }
    } catch (e) {
      setWalletError(e instanceof Error ? e.message : 'Failed to fetch wallet');
      trackWalletImportFailed(e instanceof Error ? e.message : 'unknown');
    } finally {
      setWalletLoading(false);
    }
  };

  const handleRemoveHolding = (id: string) => {
    setWalletHoldings((prev) => prev.filter((h) => h.id !== id));
  };

  const handleConfirmImport = async () => {
    if (walletHoldings.length === 0) return;
    const portfolioId = activePortfolioId ?? DEFAULT_PORTFOLIO_ID;
    const existingHoldings = await holdingRepo.getByPortfolioId(db, portfolioId);
    const existingSymbols = new Set(
      existingHoldings
        .filter((h) => h.type === 'crypto' && h.symbol)
        .map((h) => h.symbol!.toUpperCase())
    );
    const newOnly = walletHoldings.filter((h) => !existingSymbols.has(h.symbol.toUpperCase()));
    if (newOnly.length === 0) {
      Alert.alert('No new tokens', 'All tokens from this address are already in your portfolio.', [{ text: 'OK' }]);
      return;
    }
    const count = existingHoldings.length;
    const allowed = isPro ? newOnly.length : Math.max(0, FREE_HOLDINGS_LIMIT - count);
    if (allowed <= 0) {
      (navigation as any).navigate('Paywall', { trigger: `holdings limit (${FREE_HOLDINGS_LIMIT})` });
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
    const createdHoldings: { id: string; metadata?: Record<string, string> }[] = [];
    try {
      for (const h of toImport) {
        // Build metadata: contract address, Ethplorer price, underlying symbol
        const metadata: Record<string, string> = {};
        if (h.contractAddress) {
          metadata.contractAddress = h.contractAddress;
          metadata.network = 'ethereum';
        }
        if (h.priceUsd != null && h.priceUsd > 0) {
          metadata.ethplorerPrice = String(h.priceUsd);
        }
        const underlying = resolveUnderlyingSymbol(h.symbol);
        if (underlying) {
          metadata.underlyingSymbol = underlying;
        }
        const metadataOrUndef = Object.keys(metadata).length > 0 ? metadata : undefined;
        const parsed = createListedHoldingSchema.safeParse({
          portfolioId,
          type: 'crypto' as const,
          name: h.name || h.symbol,
          symbol: h.symbol,
          quantity: h.quantity,
          costBasis: undefined,
          costBasisCurrency: undefined,
          currency: 'USD',
          metadata: metadataOrUndef,
        });
        if (!parsed.success) { failed.push(h.symbol); continue; }
        try {
          const created = await holdingRepo.createListed(db, parsed.data);
          createdHoldings.push({ id: created.id, metadata: created.metadata as Record<string, string> | undefined });
          // Pass pricing metadata including ethplorerPrice for fallback
          const priceMeta = {
            ...metadataOrUndef,
            ethplorerPrice: h.priceUsd,
          };
          await getLatestPrice(db, parsed.data.symbol, 'crypto', priceMeta);
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
            Alert.alert('Import completed', `Cost basis: ${lots.length} lots.${unpricedMsg}`, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
            return;
          }
        } catch {
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

  const hasHoldings = walletHoldings.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
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
          onChangeText={(text) => { setWalletAddress(text); setWalletError(null); }}
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
            <Text style={styles.note}>
              Tokens already in your portfolio will be skipped. Swipe left to remove.
            </Text>
            {walletHoldings.map((h) => (
              <WalletHoldingRow key={h.id} holding={h} onRemove={handleRemoveHolding} />
            ))}
          </>
        ) : null}
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </ScrollView>
      {hasHoldings ? (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.floatingButton, walletImporting && styles.buttonDisabled]}
            onPress={handleConfirmImport}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.layout.screenPadding },
  scrollContentWithFooter: { paddingBottom: WALLET_FOOTER_HEIGHT + theme.spacing.lg },
  title: { ...theme.typography.title2, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
  label: { ...theme.typography.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm, fontSize: 16, backgroundColor: theme.colors.surface, color: theme.colors.textPrimary,
  },
  sectionLabel: { ...theme.typography.captionMedium, color: theme.colors.textPrimary, marginTop: theme.spacing.lg, marginBottom: theme.spacing.xs },
  note: { ...theme.typography.small, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  errorText: { ...theme.typography.caption, color: theme.colors.error, marginTop: theme.spacing.xs },
  button: {
    backgroundColor: theme.colors.white, padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius, alignItems: 'center', marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.background, ...theme.typography.bodyMedium },
  backButton: { marginTop: theme.spacing.sm, alignItems: 'center' },
  backButtonText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  footer: {
    position: 'absolute', left: theme.layout.screenPadding,
    right: theme.layout.screenPadding, bottom: theme.spacing.lg,
  },
  floatingButton: {
    backgroundColor: theme.colors.white, paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.layout.screenPadding, borderRadius: theme.layout.cardRadius,
    alignItems: 'center', elevation: 4, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4,
  },
});
