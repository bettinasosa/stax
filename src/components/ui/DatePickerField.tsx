import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Platform,
  Modal,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { theme } from '../../utils/theme';

const PICKER_HORIZONTAL_MARGIN = theme.spacing.lg;

/** Format Date to YYYY-MM-DD. */
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD string to Date, or return undefined if invalid. */
function fromYMD(s: string): Date | undefined {
  if (!s.trim()) return undefined;
  const d = new Date(s.trim());
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export interface DatePickerFieldProps {
  /** Current value as YYYY-MM-DD or empty. */
  value: string;
  /** Called with YYYY-MM-DD when user selects a date. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Optional label text (parent can also render its own label). */
  label?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}

/**
 * Touchable that opens the native date picker. Value is displayed as formatted date;
 * on pick (Android: tap date; iOS: tap Done), onChange is called with YYYY-MM-DD.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = 'YYYY-MM-DD',
  label,
  minimumDate,
  maximumDate,
}: DatePickerFieldProps) {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(() => fromYMD(value) ?? new Date());

  const displayValue = value.trim()
    ? (() => {
        const d = fromYMD(value);
        return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : value;
      })()
    : '';

  const initialDate = fromYMD(value) ?? new Date();

  const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && selectedDate) onChange(toYMD(selectedDate));
      return;
    }
    if (selectedDate) setTempDate(selectedDate);
  };

  const handlePress = () => {
    setTempDate(fromYMD(value) ?? new Date());
    setShow(true);
  };

  const handleDone = () => {
    onChange(toYMD(tempDate));
    setShow(false);
  };

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TouchableOpacity style={styles.touchable} onPress={handlePress} activeOpacity={0.7}>
        <Text style={[styles.text, !displayValue && styles.placeholder]}>
          {displayValue || placeholder}
        </Text>
      </TouchableOpacity>
      {show && (
        <Modal visible transparent animationType="fade">
          <TouchableWithoutFeedback onPress={Platform.OS === 'ios' ? () => setShow(false) : undefined}>
            <View style={styles.modalBackdrop}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.modalContent}>
                  <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={Platform.OS === 'ios' ? tempDate : initialDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleChange}
                  minimumDate={minimumDate}
                  maximumDate={maximumDate}
                  themeVariant="dark"
                  textColor={theme.colors.textPrimary}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={styles.doneRow} onPress={handleDone}>
                    <Text style={styles.doneText}>Done</Text>
                  </TouchableOpacity>
                )}
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  touchable: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: PICKER_HORIZONTAL_MARGIN,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerContainer: {
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.layout.cardRadius,
    overflow: 'hidden',
  },
  text: {
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  placeholder: {
    color: theme.colors.textTertiary,
  },
  doneRow: {
    paddingVertical: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
    alignItems: 'flex-end',
  },
  doneText: {
    ...theme.typography.bodyMedium,
    color: theme.colors.textPrimary,
  },
});
