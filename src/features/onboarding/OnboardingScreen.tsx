import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useSQLiteContext } from 'expo-sqlite';
import { portfolioRepo } from '../../data';
import { DEFAULT_PORTFOLIO_ID } from '../../data/db';
import { theme } from '../../utils/theme';
import { OnboardingPagination } from './OnboardingPagination';

/* ---------- page data ---------- */

interface PageData {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
}

const PAGES: PageData[] = [
  {
    id: 'welcome',
    emoji: '📊',
    title: 'Welcome to Stax',
    subtitle: 'All your assets. One view.\nStocks, crypto, real estate, fixed income — track everything in a single portfolio.',
  },
  {
    id: 'overview',
    emoji: '🏠',
    title: 'Overview',
    subtitle: 'See your total portfolio value, 7-day performance chart, and top holdings at a glance. Your financial snapshot, always up to date.',
  },
  {
    id: 'holdings',
    emoji: '📋',
    title: 'Holdings',
    subtitle: 'Browse all your positions by asset type. Tap the + button to add stocks, crypto, metals, real estate, and more.',
  },
  {
    id: 'insights',
    emoji: '📈',
    title: 'Charts & Insights',
    subtitle: 'Dive into detailed charts, allocation analysis, and your Stax Score. Unlock Pro for advanced analytics and recommendations.',
  },
  {
    id: 'currency',
    emoji: '💰',
    title: 'Set your currency',
    subtitle: 'Choose the base currency for your portfolio. All values will be displayed in this currency.',
  },
];

const LAST_INDEX = PAGES.length - 1;

/* ---------- component ---------- */

/**
 * Five-page swipeable onboarding flow: Welcome, Overview tab, Holdings tab,
 * Charts & Insights, and base-currency setup.
 */
export function OnboardingScreen() {
  const { setOnboardingDone } = useAuth();
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const flatListRef = useRef<FlatList<PageData>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

  /* Track visible page */
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  /* Navigate to a specific page */
  const goToPage = useCallback(
    (index: number) => {
      flatListRef.current?.scrollToIndex({ index, animated: true });
    },
    [],
  );

  /* Skip to last page */
  const handleSkip = useCallback(() => goToPage(LAST_INDEX), [goToPage]);

  /* Next or finish */
  const handleNext = useCallback(() => {
    if (activeIndex < LAST_INDEX) {
      goToPage(activeIndex + 1);
    }
  }, [activeIndex, goToPage]);

  /* Finish onboarding: save currency and mark done */
  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await portfolioRepo.update(db, DEFAULT_PORTFOLIO_ID, {
        baseCurrency: baseCurrency.trim().toUpperCase() || 'USD',
      });
      await setOnboardingDone(true);
    } catch {
      setSaving(false);
    }
  }, [db, baseCurrency, setOnboardingDone]);

  /* Render a single page */
  const renderPage = useCallback(
    ({ item, index }: { item: PageData; index: number }) => {
      const isCurrencyPage = index === LAST_INDEX;
      return (
        <View style={[styles.page, { width }]}>
          <View style={styles.pageContent}>
            <Text style={styles.emoji}>{item.emoji}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.subtitle}>{item.subtitle}</Text>
            {isCurrencyPage && (
              <TextInput
                style={styles.currencyInput}
                placeholder="USD"
                placeholderTextColor={theme.colors.textTertiary}
                value={baseCurrency}
                onChangeText={setBaseCurrency}
                autoCapitalize="characters"
                maxLength={3}
              />
            )}
          </View>
        </View>
      );
    },
    [width, baseCurrency],
  );

  const isLastPage = activeIndex === LAST_INDEX;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Skip button (top right) — hidden on last page */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        {!isLastPage ? (
          <TouchableOpacity onPress={handleSkip} hitSlop={16}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View />
        )}
      </View>

      {/* Pages */}
      <FlatList
        ref={flatListRef}
        data={PAGES}
        keyExtractor={(item) => item.id}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      {/* Bottom: pagination + button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <OnboardingPagination total={PAGES.length} activeIndex={activeIndex} />

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={isLastPage ? handleFinish : handleNext}
          disabled={saving}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isLastPage ? (saving ? 'Saving...' : "Let's go") : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  /* Top bar with skip */
  topBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.layout.screenPadding,
  },
  skipText: {
    ...theme.typography.captionMedium,
    color: theme.colors.textSecondary,
  },
  /* Page */
  page: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  pageContent: {
    alignItems: 'center',
    maxWidth: 340,
  },
  emoji: {
    fontSize: 64,
    marginBottom: theme.spacing.lg,
  },
  title: {
    ...theme.typography.title,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  subtitle: {
    ...theme.typography.body,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  /* Currency input (last page) */
  currencyInput: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    padding: theme.spacing.md,
    fontSize: 18,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    width: 120,
  },
  /* Bottom bar */
  bottomBar: {
    paddingHorizontal: theme.layout.screenPadding,
    gap: theme.spacing.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.white,
    paddingVertical: 16,
    borderRadius: theme.layout.cardRadius,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: theme.colors.background,
    ...theme.typography.bodySemi,
  },
});
