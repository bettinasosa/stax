import React from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../utils/theme';

interface OnboardingPaginationProps {
  total: number;
  activeIndex: number;
}

/**
 * Dot pagination indicator for the onboarding flow.
 */
export function OnboardingPagination({ total, activeIndex }: OnboardingPaginationProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
        />
      ))}
    </View>
  );
}

const DOT_SIZE = 8;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  dotActive: {
    backgroundColor: theme.colors.white,
    width: DOT_SIZE * 3,
    borderRadius: DOT_SIZE / 2,
  },
  dotInactive: {
    backgroundColor: theme.colors.border,
  },
});
