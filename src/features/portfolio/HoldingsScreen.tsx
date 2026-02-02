import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { holdingRepo } from '../../data';
import { usePortfolio } from './usePortfolio';
import { holdingsWithValues, formatHoldingValueDisplay, type HoldingWithValue } from './portfolioUtils';
import { theme } from '../../utils/theme';

/** Filter pill labels and types they include. */
const FILTER_PILLS: { label: string; types: string[] }[] = [
  { label: 'All', types: [] },
  { label: 'Stocks', types: ['stock', 'etf'] },
  { label: 'Crypto', types: ['crypto'] },
  { label: 'Commodities', types: ['commodity'] },
  { label: 'Fixed Income', types: ['fixed_income'] },
  { label: 'Real Estate', types: ['real_estate'] },
  { label: 'Cash', types: ['cash'] },
  { label: 'Other', types: ['other', 'metal'] },
];

/**
 * Holdings list: name, asset class badge, value, weight %. Filter pills. Tap row -> detail.
 * Edit button under bubbles toggles edit mode: red minus on each row to remove. Floating + Add.
 */
export function HoldingsScreen() {
  const navigation = useNavigation();
  const db = useSQLiteContext();
  const { portfolio, holdings, pricesBySymbol, loading, refresh } = usePortfolio();
  const [filterIndex, setFilterIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency),
    [holdings, pricesBySymbol, baseCurrency]
  );

  const filtered = useMemo(() => {
    const pill = FILTER_PILLS[filterIndex];
    if (pill.types.length === 0) return withValues;
    return withValues.filter((x) => pill.types.includes(x.holding.type));
  }, [withValues, filterIndex]);

  const handlePress = (item: HoldingWithValue) => {
    (navigation as { navigate: (s: string, p: object) => void }).navigate('HoldingDetail', {
      holdingId: item.holding.id,
    });
  };

  const handleDelete = (item: HoldingWithValue) => {
    Alert.alert(
      'Remove holding',
      `Remove "${item.holding.name}" from your portfolio?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await holdingRepo.remove(db, item.holding.id);
            refresh();
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: HoldingWithValue }) => (
    <View style={styles.rowWrapper}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => !editMode && handlePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.rowLeft}>
          <Text style={styles.name} numberOfLines={1}>
            {item.holding.name}
          </Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.holding.type.replace(/_/g, ' ')}</Text>
          </View>
        </View>
        {!editMode && (
          <View style={styles.rowRight}>
            <View>
              <Text style={styles.value}>
                {formatHoldingValueDisplay(
                  item.holding,
                  item.holding.symbol ? pricesBySymbol.get(item.holding.symbol) ?? null : null,
                  baseCurrency
                )}
              </Text>
              {item.holding.symbol && (() => {
                const pr = pricesBySymbol.get(item.holding.symbol!);
                const pct = pr?.changePercent;
                if (pct == null || pct === 0) return null;
                const isPositive = pct > 0;
                return (
                  <Text style={[styles.dailyChange, isPositive ? styles.dailyChangeUp : styles.dailyChangeDown]}>
                    {isPositive ? '+' : ''}{pct.toFixed(2)}%
                  </Text>
                );
              })()}
            </View>
            <Text style={styles.weight}>{item.weightPercent.toFixed(1)}%</Text>
          </View>
        )}
        {editMode && (
          <TouchableOpacity
            style={styles.removeCircleBtn}
            onPress={() => handleDelete(item)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.removeCircleBtnText}>−</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );

  if (holdings.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No holdings yet</Text>
        <Text style={styles.emptyText}>
          Add your first asset to see your portfolio.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => (navigation as { navigate: (s: string) => void }).navigate('AddAsset')}
        >
          <Text style={styles.primaryButtonText}>Add asset</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        {FILTER_PILLS.map((pill, i) => (
          <TouchableOpacity
            key={pill.label}
            style={[styles.filterChip, filterIndex === i && styles.filterChipActive]}
            onPress={() => setFilterIndex(i)}
          >
            <Text style={filterIndex === i ? styles.filterChipTextActive : styles.filterChipText}>
              {pill.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.editRow}>
        <TouchableOpacity
          style={[styles.editButton, editMode && styles.editButtonActive]}
          onPress={() => setEditMode((prev) => !prev)}
        >
          <Text style={editMode ? styles.editButtonTextActive : styles.editButtonText}>
            {editMode ? 'Done' : 'Edit'}
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.holding.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textPrimary} />
        }
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          const pill = FILTER_PILLS[filterIndex];
          const initialType = pill.types.length > 0 ? pill.types[0] : undefined;
          (navigation as { navigate: (s: string, p?: { initialType?: string }) => void }).navigate(
            'AddAsset',
            initialType ? { initialType } : undefined
          );
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  listContent: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.xxl + theme.layout.screenPadding,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  filterChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.textPrimary,
    borderColor: theme.colors.textPrimary,
  },
  filterChipText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    ...theme.typography.caption,
    color: theme.colors.background,
  },
  editRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  editButton: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  editButtonActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
  },
  editButtonText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  editButtonTextActive: {
    ...theme.typography.caption,
    color: theme.colors.textPrimary,
  },
  rowWrapper: {
    marginBottom: theme.spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.layout.screenPadding,
    borderRadius: theme.radius.sm,
    minHeight: theme.layout.rowHeight,
  },
  rowLeft: { flex: 1 },
  removeCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.negative,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeCircleBtnText: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 22,
  },
  name: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.border,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  badgeText: {
    ...theme.typography.small,
    color: theme.colors.textSecondary,
  },
  rowRight: { alignItems: 'flex-end' },
  value: {
    ...theme.typography.bodySemi,
    color: theme.colors.textPrimary,
  },
  dailyChange: {
    ...theme.typography.small,
    marginTop: 2,
  },
  dailyChangeUp: { color: theme.colors.positive },
  dailyChangeDown: { color: theme.colors.negative },
  weight: {
    ...theme.typography.small,
    color: theme.colors.textTertiary,
    marginTop: 2,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  emptyTitle: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  emptyText: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  primaryButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  primaryButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
  fab: {
    position: 'absolute',
    bottom: theme.spacing.lg,
    right: theme.layout.screenPadding,
    backgroundColor: theme.colors.white,
    borderRadius: theme.layout.cardRadius,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  fabText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.background,
  },
});
