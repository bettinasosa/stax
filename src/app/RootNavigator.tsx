import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../features/auth/LoginScreen';
import { SignUpScreen } from '../features/auth/SignUpScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { ImportCSVScreen } from '../features/settings/ImportCSVScreen';
import { PortfoliosScreen } from '../features/portfolio/PortfoliosScreen';
import { PaywallScreen } from '../features/analysis/PaywallScreen';
import { AppNavigation } from './navigation';
import { theme } from '../utils/theme';

const Stack = createNativeStackNavigator();

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={theme.colors.textPrimary} />
      <Text style={styles.loadingText}>Loading…</Text>
    </View>
  );
}

/** Wrapper for PaywallScreen that works with React Navigation */
function PaywallScreenWrapper({ route, navigation }: any) {
  const trigger = route.params?.trigger;
  
  const handleDismiss = () => {
    navigation.goBack();
  };
  
  const handleSuccess = () => {
    navigation.goBack();
  };
  
  return (
    <PaywallScreen 
      trigger={trigger} 
      onDismiss={handleDismiss} 
      onSuccess={handleSuccess} 
    />
  );
}

/**
 * Root flow: Auth (login/signup) → Onboarding → Main app tabs.
 * When Supabase is not configured, auth is skipped (guest mode).
 */
export function RootNavigator() {
  const { loading, isAuthenticated, onboardingDone } = useAuth();

  if (loading || onboardingDone === null) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return (
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.textPrimary,
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="SignUp"
            component={SignUpScreen}
            options={{ title: 'Sign up', headerBackTitle: 'Back' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  if (!onboardingDone) {
    return (
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.background },
          headerTintColor: theme.colors.textPrimary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen
          name="Main"
          component={AppNavigation}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Settings' }}
        />
        <Stack.Screen
          name="ImportCSV"
          component={ImportCSVScreen}
          options={{ title: 'Import from CSV' }}
        />
        <Stack.Screen
          name="Portfolios"
          component={PortfoliosScreen}
          options={{ title: 'Portfolios' }}
        />
        <Stack.Screen
          name="Paywall"
          component={PaywallScreenWrapper}
          options={{ 
            title: 'Stax Pro',
            presentation: 'modal',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    ...theme.typography.caption,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
});
