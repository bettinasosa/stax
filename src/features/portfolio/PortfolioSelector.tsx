import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import type { Portfolio } from '../../data/schemas';
import { theme } from '../../utils/theme';

export interface PortfolioSelectorProps {
  currentPortfolio: Portfolio | null;
  portfolios: Portfolio[];
  onSwitch: (id: string) => void;
  onManage: () => void;
}

/**
 * Header control: shows current portfolio name; tap opens modal to switch or go to management.
 */
export function PortfolioSelector({
  currentPortfolio,
  portfolios,
  onSwitch,
  onManage,
}: PortfolioSelectorProps) {
  const [visible, setVisible] = useState(false);

  const handleSelect = (id: string) => {
    if (id !== currentPortfolio?.id) onSwitch(id);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.triggerLabel} numberOfLines={1}>
          {currentPortfolio?.name ?? 'Portfolio'}
        </Text>
        <Text style={styles.triggerChevron}>▼</Text>
      </TouchableOpacity>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Switch portfolio</Text>
            <FlatList
              data={portfolios}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => {
                const isActive = item.id === currentPortfolio?.id;
                return (
                  <TouchableOpacity
                    style={[styles.option, isActive && styles.optionActive]}
                    onPress={() => handleSelect(item.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.optionName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {isActive && <Text style={styles.optionBadge}>Active</Text>}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity
              style={styles.manageButton}
              onPress={() => {
                setVisible(false);
                onManage();
              }}
            >
              <Text style={styles.manageButtonText}>Manage portfolios</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    maxWidth: 180,
  },
  triggerLabel: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    marginRight: 4,
  },
  triggerChevron: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    width: '100%',
    maxWidth: 320,
    maxHeight: '70%',
  },
  modalTitle: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },
  optionActive: {
    backgroundColor: theme.colors.border,
  },
  optionName: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  optionBadge: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },
  manageButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  manageButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.accent,
  },
});
