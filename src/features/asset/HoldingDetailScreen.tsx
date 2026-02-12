import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { holdingRepo, eventRepo, lotRepo, transactionRepo } from '../../data';
import { updateHoldingSchema } from '../../data/schemas';
import { cancelEventNotification } from '../../services/notifications';
import type { Holding, Event, Lot, Transaction } from '../../data/schemas';
import { formatMoney } from '../../utils/money';
import { usePortfolio } from '../portfolio/usePortfolio';
import { holdingValueInBase } from '../portfolio/portfolioUtils';
import { theme } from '../../utils/theme';
import { fetchWalletHoldings } from '../../services/ethplorer';
import { useFinancialMetrics } from '../charts/hooks/useFinancialMetrics';
import { useCompanyProfile } from '../charts/hooks/useCompanyProfile';
import { isFinnhubConfigured } from '../../services/finnhub';

type RouteParams = { HoldingDetail: { holdingId: string } };

const isListed = (type: string) => ['stock', 'etf', 'crypto', 'metal', 'commodity'].includes(type);

function formatMetric(
  value: number | null | undefined,
  decimals: number,
  prefix = '',
  suffix = '',
): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${prefix}${value.toFixed(decimals)}${suffix}`;
}

function formatLargeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}T`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}B`;
  return `$${value.toFixed(0)}M`;
}

/**
 * Holding Detail: summary, editable fields, events list, Add Event, Edit, Delete.
 */
export function HoldingDetailScreen() {
  const db = useSQLiteContext();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'HoldingDetail'>>();
  const holdingId = route.params?.holdingId ?? '';
  const { portfolio, pricesBySymbol, totalBase, refresh, fxRates } = usePortfolio();
  const [holding, setHolding] = useState<Holding | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fundamentals for stock/ETF holdings
  const isStockOrEtf = holding?.type === 'stock' || holding?.type === 'etf';
  const fSymbol = isStockOrEtf && isFinnhubConfigured() ? holding?.symbol ?? null : null;
  const { metrics: fundamentalsMetrics, loading: metricsLoading } = useFinancialMetrics(fSymbol);
  const { profile: companyProfile } = useCompanyProfile(fSymbol);

  const compactMetrics = useMemo(() => {
    if (!fundamentalsMetrics?.metric) return [];
    const m = fundamentalsMetrics.metric;
    return [
      { label: 'P/E Ratio', value: formatMetric(m.peBasicExclExtraTTM, 1) },
      { label: 'EPS (TTM)', value: formatMetric(m.epsBasicExclExtraItemsTTM, 2, '$') },
      { label: 'Market Cap', value: formatLargeNumber(m.marketCapitalization) },
      { label: 'Div. Yield', value: formatMetric(m.dividendYieldIndicatedAnnual, 2, '', '%') },
      { label: '52W High', value: formatMetric(m['52WeekHigh'], 2, '$') },
      { label: '52W Low', value: formatMetric(m['52WeekLow'], 2, '$') },
      { label: 'ROE', value: formatMetric(m.roeTTM, 1, '', '%') },
      { label: 'Net Margin', value: formatMetric(m.netProfitMarginTTM, 1, '', '%') },
    ].filter((c) => c.value !== '--');
  }, [fundamentalsMetrics]);

  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editManualValue, setEditManualValue] = useState('');
  const [editCurrency, setEditCurrency] = useState('');

  const load = useCallback(async () => {
    const h = await holdingRepo.getById(db, holdingId);
    setHolding(h ?? null);
    if (h) {
      setEditName(h.name);
      setEditQuantity(h.quantity != null ? String(h.quantity) : '');
      setEditManualValue(h.manualValue != null ? String(h.manualValue) : '');
      setEditCurrency(h.currency);
    }
    const [e, l, t] = await Promise.all([
      eventRepo.getByHoldingId(db, holdingId),
      lotRepo.getByHoldingId(db, holdingId),
      transactionRepo.getByHoldingId(db, holdingId),
    ]);
    setEvents(e);
    setLots(l);
    setTransactions(t);
    setLoading(false);
  }, [db, holdingId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (holdingId) load();
    });
    return unsubscribe;
  }, [navigation, holdingId, load]);

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const valueBase = holding
    ? holdingValueInBase(
        holding,
        holding.symbol ? pricesBySymbol.get(holding.symbol) ?? null : null,
        baseCurrency,
        fxRates
      )
    : 0;
  const weightPercent = totalBase > 0 ? (valueBase / totalBase) * 100 : 0;

  const handleSaveHolding = async () => {
    if (!holding) return;
    const updates: { name?: string; quantity?: number; manualValue?: number; currency?: string } = {};
    updates.name = editName.trim() || holding.name;
    updates.currency = editCurrency || holding.currency;
    if (isListed(holding.type)) {
      const q = parseFloat(editQuantity);
      if (!Number.isNaN(q) && q >= 0) updates.quantity = q;
    } else {
      const v = parseFloat(editManualValue);
      if (!Number.isNaN(v) && v >= 0) updates.manualValue = v;
    }
    const parsed = updateHoldingSchema.safeParse(updates);
    if (!parsed.success) {
      Alert.alert('Validation error', parsed.error.message);
      return;
    }
    setSaving(true);
    try {
      await holdingRepo.update(db, holdingId, parsed.data);
      await load();
      refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHolding = () => {
    Alert.alert(
      'Delete holding',
      'Remove this holding and all its events?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await eventRepo.getByHoldingId(db, holdingId).then((evs) => {
              return Promise.all(evs.map((e) => eventRepo.remove(db, e.id)));
            });
            await lotRepo.deleteByHoldingId(db, holdingId);
            await holdingRepo.remove(db, holdingId);
            refresh();
            (navigation as { goBack: () => void }).goBack();
          },
        },
      ]
    );
  };

  const handleDeleteEvent = (eventId: string) => {
    Alert.alert(
      'Delete event',
      'Remove this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await cancelEventNotification(eventId);
            await eventRepo.remove(db, eventId);
            load();
          },
        },
      ]
    );
  };

  const handleDeleteTransaction = (txnId: string) => {
    Alert.alert('Delete transaction', 'Remove this transaction record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await transactionRepo.remove(db, txnId);
          load();
        },
      },
    ]);
  };

  const handleRefreshWallet = async () => {
    if (!holding?.metadata?.walletAddress || !holding.symbol) return;
    setRefreshing(true);
    try {
      const walletHoldings = await fetchWalletHoldings(holding.metadata.walletAddress);
      const match = walletHoldings.find(
        (wh) => wh.symbol.toUpperCase() === holding.symbol!.toUpperCase(),
      );
      if (match) {
        await holdingRepo.update(db, holdingId, { quantity: match.quantity });
        await load();
        refresh();
        Alert.alert('Updated', `${holding.symbol} quantity updated to ${match.quantity}`);
      } else {
        Alert.alert('Not found', `${holding.symbol} was not found in this wallet.`);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  };

  const nav = navigation as { navigate: (s: string, p: object) => void };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  if (!holding) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Holding not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.value}>{formatMoney(valueBase, baseCurrency)}</Text>
        <Text style={styles.weight}>{weightPercent.toFixed(1)}% of portfolio</Text>
        {holding.symbol && (() => {
          const pr = pricesBySymbol.get(holding.symbol);
          const pct = pr?.changePercent;
          if (pct == null || pct === 0) return null;
          const isPositive = pct > 0;
          return (
            <Text style={[styles.dailyChange, isPositive ? styles.dailyChangeUp : styles.dailyChangeDown]}>
              Day: {isPositive ? '+' : ''}{pct.toFixed(2)}%
            </Text>
          );
        })()}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{holding.type.replace(/_/g, ' ')}</Text>
        </View>
        {lots.length > 0 && (() => {
          const agg = lotRepo.aggregateLotsCost(lots);
          const hasUnpriced = lots.some((l) => l.costBasisUsdTotal == null);
          if (hasUnpriced) {
            return (
              <Text style={styles.muted}>Price unavailable for some lots. Set manually.</Text>
            );
          }
          if (agg) {
            return (
              <Text style={styles.muted}>
                Cost basis: {formatMoney(agg.totalCostUsd, 'USD')} ({lots.length} lots)
              </Text>
            );
          }
          return null;
        })()}
      </View>

      {isStockOrEtf && isFinnhubConfigured() && (
        <View style={styles.fundamentalsSection}>
          <Text style={styles.sectionTitle}>Fundamentals</Text>
          {metricsLoading ? (
            <ActivityIndicator color={theme.colors.textSecondary} size="small" style={{ paddingVertical: theme.spacing.sm }} />
          ) : compactMetrics.length > 0 ? (
            <>
              <View style={styles.metricsGrid}>
                {compactMetrics.map((c) => (
                  <View key={c.label} style={styles.metricCard}>
                    <Text style={styles.metricLabel}>{c.label}</Text>
                    <Text style={styles.metricValue}>{c.value}</Text>
                  </View>
                ))}
              </View>
              {companyProfile && (
                <View style={styles.profileSummary}>
                  {companyProfile.finnhubIndustry ? (
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Industry</Text>
                      <Text style={styles.metadataValue}>{companyProfile.finnhubIndustry}</Text>
                    </View>
                  ) : null}
                  {companyProfile.country ? (
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Country</Text>
                      <Text style={styles.metadataValue}>{companyProfile.country}</Text>
                    </View>
                  ) : null}
                  {companyProfile.exchange ? (
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataLabel}>Exchange</Text>
                      <Text style={styles.metadataValue}>{companyProfile.exchange}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.muted}>No fundamental data available.</Text>
          )}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Transactions</Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {isListed(holding.type) && (
              <TouchableOpacity
                style={styles.addEventBtn}
                onPress={() => nav.navigate('RecordSell', { holdingId })}
              >
                <Text style={styles.addEventBtnText}>+ Sell</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addEventBtn}
              onPress={() => nav.navigate('LogDividend', { holdingId })}
            >
              <Text style={styles.addEventBtnText}>+ Dividend</Text>
            </TouchableOpacity>
          </View>
        </View>
        {transactions.length === 0 ? (
          <Text style={styles.muted}>No transactions recorded yet.</Text>
        ) : (
          transactions.map((txn) => (
            <View key={txn.id} style={styles.eventRow}>
              <View style={styles.eventLeft}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <View style={[styles.badge, txn.type === 'sell' ? styles.sellBadge : styles.dividendBadge]}>
                    <Text style={styles.badgeText}>{txn.type}</Text>
                  </View>
                  <Text style={styles.eventKind}>
                    {formatMoney(txn.totalAmount, txn.currency)}
                  </Text>
                </View>
                <Text style={styles.eventDate}>{new Date(txn.date).toLocaleDateString()}</Text>
                {txn.type === 'sell' && txn.realizedGainLoss != null && (
                  <Text style={[
                    styles.eventDate,
                    txn.realizedGainLoss >= 0
                      ? { color: theme.colors.positive }
                      : { color: theme.colors.negative },
                  ]}>
                    P&L: {txn.realizedGainLoss >= 0 ? '+' : ''}{formatMoney(txn.realizedGainLoss, txn.currency)}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleDeleteTransaction(txn.id)}
                style={[styles.eventActionBtn, styles.eventActionDelete]}
              >
                <Text style={styles.eventActionDeleteText}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      {holding.type === 'fixed_income' && holding.metadata && (
        <View style={styles.metadataSection}>
          <Text style={styles.metadataTitle}>Fixed Income Details</Text>
          {holding.metadata.issuer && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Issuer:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.issuer}</Text>
            </View>
          )}
          {holding.metadata.couponRate != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Coupon Rate:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.couponRate}%</Text>
            </View>
          )}
          {holding.metadata.maturityDate && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Maturity Date:</Text>
              <Text style={styles.metadataValue}>
                {new Date(holding.metadata.maturityDate).toLocaleDateString()}
              </Text>
            </View>
          )}
          {holding.metadata.yieldToMaturity != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Yield to Maturity:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.yieldToMaturity}%</Text>
            </View>
          )}
          {holding.metadata.creditRating && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Credit Rating:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.creditRating}</Text>
            </View>
          )}
          {holding.metadata.faceValue != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Face Value:</Text>
              <Text style={styles.metadataValue}>
                {formatMoney(holding.metadata.faceValue, holding.currency)}
              </Text>
            </View>
          )}
        </View>
      )}

      {holding.type === 'real_estate' && holding.metadata && (
        <View style={styles.metadataSection}>
          <Text style={styles.metadataTitle}>Real Estate Details</Text>
          {holding.metadata.address && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Address:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.address}</Text>
            </View>
          )}
          {holding.metadata.propertyType && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Property Type:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.propertyType}</Text>
            </View>
          )}
          {holding.metadata.purchasePrice != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Purchase Price:</Text>
              <Text style={styles.metadataValue}>
                {formatMoney(holding.metadata.purchasePrice, holding.currency)}
              </Text>
            </View>
          )}
          {holding.metadata.purchaseDate && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Purchase Date:</Text>
              <Text style={styles.metadataValue}>
                {new Date(holding.metadata.purchaseDate).toLocaleDateString()}
              </Text>
            </View>
          )}
          {holding.metadata.rentalIncome != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Monthly Rent:</Text>
              <Text style={styles.metadataValue}>
                {formatMoney(holding.metadata.rentalIncome, holding.currency)}
              </Text>
            </View>
          )}
        </View>
      )}

      {holding.type === 'cash' && (holding.metadata?.apy != null || holding.metadata?.aer != null) && (
        <View style={styles.metadataSection}>
          <Text style={styles.metadataTitle}>Savings / interest</Text>
          {holding.metadata.apy != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>APY:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.apy}%</Text>
            </View>
          )}
          {holding.metadata.aer != null && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>AER:</Text>
              <Text style={styles.metadataValue}>{holding.metadata.aer}%</Text>
            </View>
          )}
        </View>
      )}

      {holding.type === 'crypto' && holding.metadata && (
        holding.metadata.network || holding.metadata.contractAddress || holding.metadata.walletAddress
      ) && (
        <View style={styles.metadataSection}>
          <Text style={styles.metadataTitle}>Crypto Details</Text>
          {holding.metadata.network && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Network</Text>
              <Text style={styles.metadataValue}>
                {holding.metadata.network.charAt(0).toUpperCase() + holding.metadata.network.slice(1)}
              </Text>
            </View>
          )}
          {holding.metadata.contractAddress && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Contract</Text>
              <Text style={styles.metadataValue} numberOfLines={1}>
                {holding.metadata.contractAddress.slice(0, 6)}...{holding.metadata.contractAddress.slice(-4)}
              </Text>
            </View>
          )}
          {holding.metadata.walletAddress && (
            <>
              <View style={styles.metadataRow}>
                <Text style={styles.metadataLabel}>Wallet</Text>
                <Text style={styles.metadataValue} numberOfLines={1}>
                  {holding.metadata.walletAddress.slice(0, 6)}...{holding.metadata.walletAddress.slice(-4)}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.refreshWalletBtn, refreshing && styles.buttonDisabled]}
                onPress={handleRefreshWallet}
                disabled={refreshing}
              >
                {refreshing ? (
                  <ActivityIndicator color={theme.colors.accent} size="small" />
                ) : (
                  <Text style={styles.refreshWalletBtnText}>Refresh Wallet</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Edit holding</Text>
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={editName}
          onChangeText={setEditName}
          placeholder="Name"
        />
        {isListed(holding.type) ? (
          <>
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              style={styles.input}
              value={editQuantity}
              onChangeText={setEditQuantity}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Current value</Text>
            <TextInput
              style={styles.input}
              value={editManualValue}
              onChangeText={setEditManualValue}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </>
        )}
        <Text style={styles.label}>Currency</Text>
        <TextInput
          style={styles.input}
          value={editCurrency}
          onChangeText={setEditCurrency}
          placeholder="USD"
        />
        <TouchableOpacity
          style={[styles.button, saving && styles.buttonDisabled]}
          onPress={handleSaveHolding}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.background} size="small" />
          ) : (
            <Text style={styles.buttonText}>Save changes</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Events</Text>
          <TouchableOpacity
            style={styles.addEventBtn}
            onPress={() => nav.navigate('AddEvent', { holdingId })}
          >
            <Text style={styles.addEventBtnText}>+ Add event</Text>
          </TouchableOpacity>
        </View>
        {events.length === 0 ? (
          <Text style={styles.muted}>No events. Add a maturity, reminder, or coupon.</Text>
        ) : (
          events.map((ev) => (
            <View key={ev.id} style={styles.eventRow}>
              <View style={styles.eventLeft}>
                <Text style={styles.eventKind}>{ev.kind.replace(/_/g, ' ')}</Text>
                <Text style={styles.eventDate}>{new Date(ev.date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.eventActions}>
                <TouchableOpacity
                  onPress={() => nav.navigate('AddEvent', { holdingId, eventId: ev.id })}
                  style={styles.eventActionBtn}
                >
                  <Text style={styles.eventActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDeleteEvent(ev.id)}
                  style={[styles.eventActionBtn, styles.eventActionDelete]}
                >
                  <Text style={styles.eventActionDeleteText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={styles.deleteHoldingBtn} onPress={handleDeleteHolding}>
        <Text style={styles.deleteHoldingText}>Delete holding</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>Back to Holdings</Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.layout.screenPadding,
  },
  error: {
    ...theme.typography.body,
    color: theme.colors.negative,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  value: {
    ...theme.typography.title2,
    fontSize: 24,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  weight: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  dailyChange: {
    ...theme.typography.caption,
    marginBottom: theme.spacing.xs,
  },
  dailyChangeUp: { color: theme.colors.positive },
  dailyChangeDown: { color: theme.colors.negative },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.border,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  badgeText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  sellBadge: {
    backgroundColor: theme.colors.negative + '33',
  },
  dividendBadge: {
    backgroundColor: theme.colors.positive + '33',
  },
  section: { marginBottom: theme.spacing.sm },
  sectionTitle: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  label: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
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
  addEventBtn: { padding: theme.spacing.xs },
  addEventBtnText: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },
  muted: {
    ...theme.typography.caption,
    color: theme.colors.textTertiary,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
  },
  eventLeft: { flex: 1 },
  eventKind: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  eventDate: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  eventActions: { flexDirection: 'row', gap: theme.spacing.sm },
  eventActionBtn: { padding: theme.spacing.xs },
  eventActionText: {
    ...theme.typography.caption,
    color: theme.colors.accent,
  },
  eventActionDelete: {},
  eventActionDeleteText: {
    ...theme.typography.caption,
    color: theme.colors.negative,
  },
  deleteHoldingBtn: { marginTop: theme.spacing.xs, padding: theme.spacing.sm, alignItems: 'center' },
  deleteHoldingText: {
    ...theme.typography.caption,
    color: theme.colors.negative,
  },
  backBtn: { marginTop: theme.spacing.sm, padding: theme.spacing.sm, alignItems: 'center' },
  backBtnText: {
    ...theme.typography.body,
    color: theme.colors.accent,
  },
  metadataSection: {
    marginBottom: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  metadataTitle: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  metadataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metadataLabel: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  metadataValue: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
    flex: 2,
    textAlign: 'right',
  },
  refreshWalletBtn: {
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignSelf: 'flex-start',
    alignItems: 'center',
  },
  refreshWalletBtnText: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },
  fundamentalsSection: {
    marginBottom: theme.spacing.sm,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  metricCard: {
    flexBasis: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    padding: theme.spacing.sm,
  },
  metricLabel: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginBottom: 4,
  },
  metricValue: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  profileSummary: {
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
