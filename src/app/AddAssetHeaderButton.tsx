import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../utils/theme';

/**
 * Header button to open Add Asset screen. Use on Holdings list only.
 */
export function AddAssetHeaderButton() {
  const navigation = useNavigation();

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('AddAsset' as never)}
      style={{ paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.xs }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ fontSize: 22, color: theme.colors.textPrimary }}>+</Text>
    </TouchableOpacity>
  );
}
