import AsyncStorage from '@react-native-async-storage/async-storage';

const ACTIVE_PORTFOLIO_ID_KEY = 'stax_active_portfolio_id';

/**
 * Get the currently selected portfolio id from persistent storage.
 * Returns null if never set (caller should fallback to default or first portfolio).
 */
export async function getActivePortfolioId(): Promise<string | null> {
  const value = await AsyncStorage.getItem(ACTIVE_PORTFOLIO_ID_KEY);
  return value;
}

/**
 * Persist the active portfolio id so it survives app restarts.
 */
export async function setActivePortfolioId(portfolioId: string): Promise<void> {
  await AsyncStorage.setItem(ACTIVE_PORTFOLIO_ID_KEY, portfolioId);
}
