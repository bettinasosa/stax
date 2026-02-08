import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { usePortfolio } from './usePortfolio';
import { theme } from '../../utils/theme';

/**
 * Manage portfolios: list, add, rename, archive, set active.
 */
export function PortfoliosScreen() {
  const {
    portfolio,
    portfolios,
    loading,
    createPortfolio,
    renamePortfolio,
    archivePortfolio,
    switchPortfolio,
  } = usePortfolio();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBaseCurrency, setNewBaseCurrency] = useState('USD');
  const [creating, setCreating] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const handleAdd = async () => {
    const name = newName.trim();
    const base = newBaseCurrency.trim().toUpperCase() || 'USD';
    if (!name) return;
    setCreating(true);
    try {
      await createPortfolio(name, base.length === 3 ? base : 'USD');
      setNewName('');
      setNewBaseCurrency('USD');
      setAddModalVisible(false);
    } catch {
      Alert.alert('Error', 'Could not create portfolio.');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async () => {
    if (!renameId) return;
    const name = renameName.trim();
    if (!name) return;
    try {
      await renamePortfolio(renameId, name);
      setRenameId(null);
      setRenameName('');
    } catch {
      Alert.alert('Error', 'Could not rename portfolio.');
    }
  };

  const handleArchive = (id: string, name: string) => {
    Alert.alert(
      'Archive portfolio',
      `Archive "${name}"? Holdings and history are kept but the portfolio will no longer appear in the list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => archivePortfolio(id),
        },
      ]
    );
  };

  if (loading && portfolios.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>
        Switch portfolios from the Overview or Holdings header. Each portfolio has its own holdings and history.
      </Text>
      <TouchableOpacity
        style={styles.addRow}
        onPress={() => setAddModalVisible(true)}
      >
        <Text style={styles.addRowText}>Add portfolio</Text>
      </TouchableOpacity>
      {portfolios.map((p) => {
        const isActive = p.id === portfolio?.id;
        return (
          <View key={p.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowName} numberOfLines={1}>
                {p.name}
              </Text>
              <Text style={styles.rowMeta}>{p.baseCurrency}</Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>
            <View style={styles.rowActions}>
              {!isActive && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => switchPortfolio(p.id)}
                >
                  <Text style={styles.actionButtonText}>Set active</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  setRenameId(p.id);
                  setRenameName(p.name);
                }}
              >
                <Text style={styles.actionButtonText}>Rename</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.archiveButton]}
                onPress={() => handleArchive(p.id, p.name)}
              >
                <Text style={styles.archiveButtonText}>Archive</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !creating && setAddModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>New portfolio</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={theme.colors.textTertiary}
              value={newName}
              onChangeText={setNewName}
              editable={!creating}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.input}
              placeholder="Base currency (e.g. USD)"
              placeholderTextColor={theme.colors.textTertiary}
              value={newBaseCurrency}
              onChangeText={setNewBaseCurrency}
              editable={!creating}
              autoCapitalize="characters"
              maxLength={3}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => !creating && setAddModalVisible(false)}
                disabled={creating}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleAdd}
                disabled={creating || !newName.trim()}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={theme.colors.background} />
                ) : (
                  <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>
                    Create
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={renameId !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Rename portfolio</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={theme.colors.textTertiary}
              value={renameName}
              onChangeText={setRenameName}
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => setRenameId(null)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={handleRename}
                disabled={!renameName.trim()}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonPrimaryText]}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  hint: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  addRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  addRowText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.accent,
  },
  row: {
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowName: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  rowMeta: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.accent + '20',
  },
  activeBadgeText: {
    ...theme.typography.captionMedium,
    color: theme.colors.accent,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
    gap: 8,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.border,
  },
  actionButtonText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textPrimary,
  },
  archiveButton: {
    backgroundColor: 'transparent',
  },
  archiveButtonText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textTertiary,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  modalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    width: '100%',
    maxWidth: 320,
  },
  modalTitle: {
    ...theme.typography.title2,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  input: {
    ...theme.typography.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  modalButton: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    minWidth: 80,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: theme.colors.accent,
  },
  modalButtonText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
  modalButtonPrimaryText: {
    color: theme.colors.white,
  },
});
