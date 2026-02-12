import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { WalletHolding } from '../../../services/ethplorer';
import { theme } from '../../../utils/theme';

const QUANTITY_SMALL = 1e-6;

/** Format a token quantity for display. */
function formatQuantity(value: number): string {
  return value < QUANTITY_SMALL ? value.toExponential(2) : value.toLocaleString();
}

interface WalletHoldingRowProps {
  holding: WalletHolding;
  onRemove: (id: string) => void;
}

/** Row for a wallet-imported token with a tap-to-remove control. */
export function WalletHoldingRow({ holding, onRemove }: WalletHoldingRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={styles.symbol}>{holding.symbol}</Text>
        {holding.name ? (
          <Text style={styles.name} numberOfLines={1}>
            {holding.name}
          </Text>
        ) : null}
      </View>
      <Text style={styles.quantity}>{formatQuantity(holding.quantity)}</Text>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemove(holding.id)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel="Remove from import"
        accessibilityRole="button"
      >
        <Text style={styles.removeIcon}>−</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
  },
  textBlock: {
    flex: 1,
    marginRight: theme.spacing.sm,
    minWidth: 0,
  },
  symbol: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  name: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  quantity: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.sm,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIcon: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.white,
    lineHeight: 24,
  },
});
