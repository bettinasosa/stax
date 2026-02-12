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
import { useNavigation, useRoute } from '@react-navigation/native';
import { holdingRepo, eventRepo } from '../../data';
import { scheduleEventNotification } from '../../services/notifications';
import { useEntitlements } from '../analysis/useEntitlements';
import { trackHoldingAdded, trackEventCreated } from '../../services/analytics';
import { createNonListedHoldingSchema } from '../../data/schemas';
import {
  ASSET_TYPE_LISTED,
  ASSET_TYPE_NON_LISTED,
  ASSET_TYPES,
  EVENT_KINDS,
  DEFAULT_REMIND_DAYS_BEFORE,
  FREE_HOLDINGS_LIMIT,
} from '../../utils/constants';
import type { AssetType, AssetTypeListed, AssetTypeNonListed, EventKind } from '../../utils/constants';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { usePortfolio } from '../portfolio/usePortfolio';
import { theme } from '../../utils/theme';
import { ListedAssetForm } from './components/ListedAssetForm';
import { WalletImportForm } from './components/WalletImportForm';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Flow = 'listed' | 'non_listed' | null;
type ListedCryptoSubFlow = 'manual' | 'wallet_import' | null;
type AddAssetRouteParams = { initialType?: AssetType };

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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

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

  const [listedType, setListedType] = useState<AssetTypeListed>(() => {
    if (initialTypeParam && ASSET_TYPE_LISTED.includes(initialTypeParam as AssetTypeListed)) {
      return initialTypeParam as AssetTypeListed;
    }
    return 'stock';
  });

  const [nonListedType, setNonListedType] = useState<AssetTypeNonListed>(() => {
    if (initialTypeParam && ASSET_TYPE_NON_LISTED.includes(initialTypeParam as AssetTypeNonListed)) {
      return initialTypeParam as AssetTypeNonListed;
    }
    return 'cash';
  });

  const [listedCryptoSubFlow, setListedCryptoSubFlow] = useState<ListedCryptoSubFlow>(null);

  // Non-listed form state
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [nonListedCurrency, setNonListedCurrency] = useState('USD');
  const [eventKind, setEventKind] = useState('');
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

  const selectType = (type: AssetType) => {
    if (ASSET_TYPE_LISTED.includes(type as AssetTypeListed)) {
      setFlow('listed');
      setListedType(type as AssetTypeListed);
      setListedCryptoSubFlow(null);
    } else {
      setFlow('non_listed');
      setNonListedType(type as AssetTypeNonListed);
    }
  };

  const handleSaveNonListed = async () => {
    if (!isPro) {
      const count = await holdingRepo.countByPortfolioId(db, activePortfolioId ?? DEFAULT_PORTFOLIO_ID);
      if (count >= FREE_HOLDINGS_LIMIT) {
        (navigation as any).navigate('Paywall', { trigger: `holdings limit (${FREE_HOLDINGS_LIMIT})` });
        return;
      }
    }
    const val = parseFloat(manualValue);
    if (!name.trim() || isNaN(val) || val < 0) {
      Alert.alert('Invalid input', 'Name and a non-negative value are required.');
      return;
    }

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

  // ─── Asset type picker ───────────────────────────────────────────────
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

  // ─── Listed asset flows ──────────────────────────────────────────────
  if (flow === 'listed') {
    const isCrypto = listedType === 'crypto';

    // Crypto: choice screen (manual vs wallet)
    if (isCrypto && listedCryptoSubFlow === null) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionLabel}>Add crypto</Text>
          <TouchableOpacity style={styles.option} onPress={() => setListedCryptoSubFlow('manual')}>
            <Text style={styles.optionText}>Add manually (symbol, quantity, etc.)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={() => setListedCryptoSubFlow('wallet_import')}>
            <Text style={styles.optionText}>Import from Ethereum wallet address</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={() => setFlow(null)}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    // Crypto: wallet import
    if (isCrypto && listedCryptoSubFlow === 'wallet_import') {
      return (
        <WalletImportForm
          onBack={() => {
            setListedCryptoSubFlow(null);
          }}
        />
      );
    }

    // Listed asset form (stock, ETF, crypto manual, metal, commodity)
    return (
      <ListedAssetForm
        listedType={listedType}
        isCryptoManual={isCrypto && listedCryptoSubFlow === 'manual'}
        onBack={() => (isCrypto ? setListedCryptoSubFlow(null) : setFlow(null))}
      />
    );
  }

  // ─── Non-listed asset form ───────────────────────────────────────────
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
          <TextInput style={styles.input} value={couponRate} onChangeText={setCouponRate} placeholder="4.5" keyboardType="decimal-pad" />
          <Text style={styles.label}>Issuer</Text>
          <TextInput style={styles.input} value={issuer} onChangeText={setIssuer} placeholder="e.g., US Treasury, Apple Inc." />
          <Text style={styles.label}>Maturity Date</Text>
          <TextInput style={styles.input} value={maturityDate} onChangeText={setMaturityDate} placeholder="YYYY-MM-DD" />
          <Text style={styles.label}>Yield to Maturity (%)</Text>
          <TextInput style={styles.input} value={yieldToMaturity} onChangeText={setYieldToMaturity} placeholder="3.8" keyboardType="decimal-pad" />
          <Text style={styles.label}>Credit Rating</Text>
          <TextInput style={styles.input} value={creditRating} onChangeText={setCreditRating} placeholder="e.g., AAA, BB+" />
          <Text style={styles.label}>Face Value</Text>
          <TextInput style={styles.input} value={faceValue} onChangeText={setFaceValue} placeholder="1000" keyboardType="decimal-pad" />
        </>
      )}

      {nonListedType === 'real_estate' && (
        <>
          <Text style={styles.sectionLabel}>Real Estate Details (optional)</Text>
          <Text style={styles.label}>Property Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="123 Main St, City, State" />
          <Text style={styles.label}>Property Type</Text>
          <TextInput style={styles.input} value={propertyType} onChangeText={setPropertyType} placeholder="e.g., Residential, Commercial" />
          <Text style={styles.label}>Monthly Rental Income</Text>
          <TextInput style={styles.input} value={rentalIncome} onChangeText={setRentalIncome} placeholder="2500" keyboardType="decimal-pad" />
          <Text style={styles.label}>Purchase Price</Text>
          <TextInput style={styles.input} value={purchasePrice} onChangeText={setPurchasePrice} placeholder="500000" keyboardType="decimal-pad" />
          <Text style={styles.label}>Purchase Date</Text>
          <TextInput style={styles.input} value={purchaseDate} onChangeText={setPurchaseDate} placeholder="YYYY-MM-DD" />
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
          <TextInput style={styles.input} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" />
          <Text style={styles.label}>Remind me (days before)</Text>
          <TextInput style={styles.input} value={remindDaysBefore} onChangeText={setRemindDaysBefore} placeholder="3" keyboardType="number-pad" />
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: { padding: theme.layout.screenPadding, paddingBottom: theme.spacing.lg },
  title: { ...theme.typography.title2, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
  typeSubtitle: { ...theme.typography.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  typeButtonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs },
  typeButton: {
    paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.md,
    borderRadius: theme.layout.cardRadius, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border, minWidth: 100,
  },
  typeButtonText: { ...theme.typography.bodyMedium, color: theme.colors.textPrimary },
  label: { ...theme.typography.captionMedium, color: theme.colors.textSecondary, marginTop: theme.spacing.sm, marginBottom: theme.spacing.xs },
  input: {
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm, fontSize: 16, backgroundColor: theme.colors.surface, color: theme.colors.textPrimary,
  },
  sectionLabel: { ...theme.typography.captionMedium, color: theme.colors.textPrimary, marginTop: theme.spacing.lg, marginBottom: theme.spacing.xs },
  option: {
    padding: theme.layout.screenPadding, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius, marginBottom: theme.spacing.sm,
  },
  optionText: { ...theme.typography.body, color: theme.colors.textPrimary },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs, marginTop: theme.spacing.xs },
  chip: {
    paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface,
    borderWidth: 1, borderColor: theme.colors.border,
  },
  chipActive: { backgroundColor: theme.colors.textPrimary, borderColor: theme.colors.textPrimary },
  chipText: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chipTextActive: { ...theme.typography.caption, color: theme.colors.background },
  button: {
    backgroundColor: theme.colors.white, padding: theme.layout.screenPadding,
    borderRadius: theme.layout.cardRadius, alignItems: 'center', marginTop: theme.spacing.lg,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: theme.colors.background, ...theme.typography.bodyMedium },
  backButton: { marginTop: theme.spacing.sm, alignItems: 'center' },
  backButtonText: { ...theme.typography.caption, color: theme.colors.textSecondary },
});
