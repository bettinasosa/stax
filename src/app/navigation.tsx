import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OverviewScreen } from '../features/portfolio/OverviewScreen';
import { HoldingsScreen } from '../features/portfolio/HoldingsScreen';
import { AddAssetScreen } from '../features/asset/AddAssetScreen';
import { HoldingDetailScreen } from '../features/asset/HoldingDetailScreen';
import { AddEventScreen } from '../features/asset/AddEventScreen';
import { AnalysisScreen } from '../features/analysis/AnalysisScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { theme } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: theme.colors.background },
  headerTintColor: theme.colors.textPrimary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: theme.colors.background },
};

function HoldingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true, ...screenOptions }}>
      <Stack.Screen
        name="HoldingsList"
        component={HoldingsScreen}
        options={{ title: 'Holdings' }}
      />
      <Stack.Screen
        name="HoldingDetail"
        component={HoldingDetailScreen}
        options={{ title: 'Holding' }}
      />
      <Stack.Screen name="AddEvent" component={AddEventScreen} options={{ title: 'Add event' }} />
    </Stack.Navigator>
  );
}

/**
 * Root app navigation: bottom tabs (Overview, Holdings, Add, Analysis, Settings).
 */
export function AppNavigation() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        ...screenOptions,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tab.Screen name="Overview" component={OverviewScreen} options={{ title: 'Stax' }} />
      <Tab.Screen
        name="Holdings"
        component={HoldingsStack}
        options={{ title: 'Holdings', headerShown: false }}
      />
      <Tab.Screen name="Add" component={AddAssetScreen} options={{ title: 'Add Asset' }} />
      <Tab.Screen name="Analysis" component={AnalysisScreen} options={{ title: 'Analysis' }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
    </Tab.Navigator>
  );
}
