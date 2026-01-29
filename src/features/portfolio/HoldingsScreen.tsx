import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePortfolio } from './usePortfolio';
import { holdingsWithValues, formatHoldingValueDisplay, type HoldingWithValue } from './portfolioUtils';
import { theme } from '../../utils/theme';

/**
 * Holdings list: name, asset class badge, value, weight %. Filter by asset class, sort by value desc. Tap -> detail.
 */
export function HoldingsScreen() {
  const navigation = useNavigation();
  const { portfolio, holdings, pricesBySymbol, loading, refresh } = usePortfolio();
  const [filterClass, setFilterClass] = useState<string | null>(null);

  const baseCurrency = portfolio?.baseCurrency ?? 'USD';
  const withValues = useMemo(
    () => holdingsWithValues(holdings, pricesBySymbol, baseCurrency),
    [holdings, pricesBySymbol, baseCurrency]
  );

  const filtered = useMemo(() => {
    if (filterClass == null) return withValues;
    return withValues.filter((x) => x.holding.type === filterClass);
  }, [withValues, filterClass]);

  const assetClasses = useMemo(() => {
    const set = new Set(holdings.map((h) => h.type));
    return Array.from(set).sort();
  }, [holdings]);

  const handlePress = (item: HoldingWithValue) => {
    (navigation as { navigate: (s: string, p: object) => void }).navigate('HoldingDetail', {
      holdingId: item.holding.id,
    });
  };

  const renderItem = ({ item }: { item: HoldingWithValue }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => handlePress(item)}
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
      <View style={styles.rowRight}>
        <Text style={styles.value}>
          {formatHoldingValueDisplay(
            item.holding,
            item.holding.symbol ? pricesBySymbol.get(item.holding.symbol) ?? null : null,
            baseCurrency
          )}
        </Text>
        <Text style={styles.weight}>{item.weightPercent.toFixed(1)}%</Text>
      </View>
    </TouchableOpacity>
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
          onPress={() => (navigation as { navigate: (s: string) => void }).navigate('Add')}
        >
          <Text style={styles.primaryButtonText}>Add asset</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {assetClasses.length > 1 && (
        <View style={styles.filters}>
          <TouchableOpacity
            style={[styles.filterChip, filterClass === null && styles.filterChipActive]}
            onPress={() => setFilterClass(null)}
          >
            <Text style={filterClass === null ? styles.filterChipTextActive : styles.filterChipText}>
              All
            </Text>
          </TouchableOpacity>
          {assetClasses.map((ac) => (
            <TouchableOpacity
              key={ac}
              style={[styles.filterChip, filterClass === ac && styles.filterChipActive]}
              onPress={() => setFilterClass(ac)}
            >
              <Text style={filterClass === ac ? styles.filterChipTextActive : styles.filterChipText}>
                {ac.replace(/_/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.holding.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.colors.textPrimary} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  listContent: {
    padding: theme.layout.screenPadding,
    paddingBottom: theme.spacing.lg,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.layout.screenPadding,
    borderRadius: theme.radius.sm,
    marginBottom: theme.spacing.xs,
    minHeight: theme.layout.rowHeight,
  },
  rowLeft: { flex: 1 },
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
});
