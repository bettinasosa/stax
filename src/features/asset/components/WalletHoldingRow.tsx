import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  TouchableOpacity,
} from 'react-native';
import type { WalletHolding } from '../../../services/ethplorer';
import { theme } from '../../../utils/theme';

const SWIPE_ACTIVATION = 12;
const SWIPE_DELETE_THRESHOLD = 72;
const DELETE_WIDTH = 96;
const SWIPE_MAX = DELETE_WIDTH + 24;
const QUANTITY_SMALL = 1e-6;

/** Format a token quantity for display. */
function formatQuantity(value: number): string {
  return value < QUANTITY_SMALL ? value.toExponential(2) : value.toLocaleString();
}

interface WalletHoldingRowProps {
  holding: WalletHolding;
  onRemove: (id: string) => void;
}

/** Swipe-to-delete row for a wallet-imported token. */
export function WalletHoldingRow({ holding, onRemove }: WalletHoldingRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const resetPosition = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  const removeRow = () => {
    Animated.timing(translateX, {
      toValue: -SWIPE_MAX,
      duration: 160,
      useNativeDriver: true,
    }).start(() => onRemove(holding.id));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > SWIPE_ACTIVATION &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx > 0) return;
        const clamped = Math.max(-SWIPE_MAX, gesture.dx);
        translateX.setValue(clamped);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -SWIPE_DELETE_THRESHOLD) {
          removeRow();
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  return (
    <View style={styles.wrapper}>
      <View style={styles.deleteZone}>
        <TouchableOpacity onPress={removeRow}>
          <Text style={styles.deleteText}>Remove</Text>
        </TouchableOpacity>
      </View>
      <Animated.View
        style={[styles.row, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.textBlock}>
          <Text style={styles.symbol}>{holding.symbol}</Text>
          {holding.name ? (
            <Text style={styles.name} numberOfLines={1}>
              {holding.name}
            </Text>
          ) : null}
        </View>
        <Text style={styles.quantity}>{formatQuantity(holding.quantity)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
  },
  deleteZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: DELETE_WIDTH,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: theme.spacing.xs,
  },
  deleteText: {
    ...theme.typography.caption,
    color: theme.colors.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  textBlock: {
    flex: 1,
    marginRight: theme.spacing.sm,
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
  },
});
