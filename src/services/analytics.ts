/**
 * Analytics: typed events for onboarding, holdings, paywall, analysis, events, notifications.
 * Wire to PostHog, Amplitude, or another provider by replacing the log implementation.
 */

export type AnalyticsEvent =
  | { name: 'onboarding_completed' }
  | { name: 'holding_added'; type: string; priced: boolean }
  | { name: 'wallet_import_started' }
  | { name: 'wallet_import_completed'; count: number }
  | { name: 'wallet_import_failed'; reason: string }
  | { name: 'csv_import_started' }
  | { name: 'csv_import_completed'; count: number }
  | { name: 'csv_import_failed'; reason: string }
  | { name: 'paywall_viewed'; trigger: string }
  | { name: 'trial_started' }
  | { name: 'purchase_completed' }
  | { name: 'analysis_viewed' }
  | { name: 'event_created' }
  | { name: 'notification_enabled' };

function logEvent(event: AnalyticsEvent): void {
  if (__DEV__) {
    console.log('[Analytics]', event.name, event);
  }
  // TODO: PostHog.capture(event.name, event) or Amplitude.logEvent(event.name, event)
}

export function trackOnboardingCompleted(): void {
  logEvent({ name: 'onboarding_completed' });
}

export function trackHoldingAdded(type: string, priced: boolean): void {
  logEvent({ name: 'holding_added', type, priced });
}

export function trackWalletImportStarted(): void {
  logEvent({ name: 'wallet_import_started' });
}

export function trackWalletImportCompleted(count: number): void {
  logEvent({ name: 'wallet_import_completed', count });
}

export function trackWalletImportFailed(reason: string): void {
  logEvent({ name: 'wallet_import_failed', reason });
}

export function trackCsvImportStarted(): void {
  logEvent({ name: 'csv_import_started' });
}

export function trackCsvImportCompleted(count: number): void {
  logEvent({ name: 'csv_import_completed', count });
}

export function trackCsvImportFailed(reason: string): void {
  logEvent({ name: 'csv_import_failed', reason });
}

export function trackPaywallViewed(trigger: string): void {
  logEvent({ name: 'paywall_viewed', trigger });
}

export function trackTrialStarted(): void {
  logEvent({ name: 'trial_started' });
}

export function trackPurchaseCompleted(): void {
  logEvent({ name: 'purchase_completed' });
}

export function trackAnalysisViewed(): void {
  logEvent({ name: 'analysis_viewed' });
}

export function trackEventCreated(): void {
  logEvent({ name: 'event_created' });
}

export function trackNotificationEnabled(): void {
  logEvent({ name: 'notification_enabled' });
}
