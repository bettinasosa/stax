import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../utils/theme';

/**
 * Header right button: profile icon, navigates to Settings.
 * Works from both tab screens and nested stack (Holdings).
 */
export function ProfileHeaderButton() {
  const navigation = useNavigation();

  const goToSettings = () => {
    const parent = navigation.getParent();
    if (parent) {
      const root = parent.getParent();
      (root ?? parent).navigate('Settings' as never);
    }
  };

  return (
    <TouchableOpacity
      onPress={goToSettings}
      style={{ paddingHorizontal: theme.spacing.xs, paddingVertical: theme.spacing.xs }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={{ fontSize: 22, color: theme.colors.textPrimary }}>👤</Text>
    </TouchableOpacity>
  );
}
