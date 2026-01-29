import * as Notifications from 'expo-notifications';
import type { Event } from '../data/schemas';

const NOTIFICATION_PREFIX = 'stax_event_';

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
 * Schedule a local notification for an event: fires at (event date - remindDaysBefore days).
 * If the trigger date is in the past, the notification is not scheduled.
 */
export async function scheduleEventNotification(event: Event): Promise<void> {
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
