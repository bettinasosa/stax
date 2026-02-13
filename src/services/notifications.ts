import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { Event } from '../data/schemas';

const NOTIFICATION_PREFIX = 'stax_event_';
const REMINDERS_ENABLED_KEY = 'stax_reminders_enabled';

/**
 * Use event.id as notification identifier so we can cancel by event.
 */
function notificationId(eventId: string): string {
  return `${NOTIFICATION_PREFIX}${eventId}`;
}

/**
 * Request notification permissions. Call from Settings or when enabling reminders.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Get current permission status.
 */
export async function getNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

/**
 * Ensure we have notification permission; request if not yet granted.
 * Returns true if permission is granted (now or already), false otherwise.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await getNotificationPermission();
  if (current) return true;
  return requestNotificationPermission();
}

/**
 * In-app preference: are reminder notifications enabled? (Default true.)
 * When false, we do not schedule new notifications and user can cancel existing ones from Settings.
 */
export async function getRemindersEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(REMINDERS_ENABLED_KEY);
  return v !== '0';
}

export async function setRemindersEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(REMINDERS_ENABLED_KEY, enabled ? '1' : '0');
}

/**
 * Cancel all scheduled notifications (e.g. when user turns reminders off in Settings).
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule a local notification for an event: fires at (event date - remindDaysBefore days).
 * If the trigger date is in the past, the notification is not scheduled.
 * Does nothing if reminders are disabled in Settings. Does not request permission; call ensureNotificationPermission() before if you want to prompt.
 */
export async function scheduleEventNotification(event: Event): Promise<void> {
  const enabled = await getRemindersEnabled();
  if (!enabled) return;
  const eventDate = new Date(event.date);
  const triggerDate = new Date(eventDate);
  triggerDate.setDate(triggerDate.getDate() - event.remindDaysBefore);
  if (triggerDate.getTime() <= Date.now()) {
    return;
  }
  const kindLabel = event.kind.replace(/_/g, ' ');
  await Notifications.scheduleNotificationAsync({
    identifier: notificationId(event.id),
    content: {
      title: `Stax: ${kindLabel}`,
      body: `${kindLabel} on ${eventDate.toLocaleDateString()}`,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });
}

/**
 * Cancel the scheduled notification for an event.
 */
export async function cancelEventNotification(eventId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId(eventId));
}
