import React from 'react';
import { View, Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OverviewScreen } from '../features/portfolio/OverviewScreen';
import { HoldingsScreen } from '../features/portfolio/HoldingsScreen';
import { AddAssetScreen } from '../features/asset/AddAssetScreen';
import { HoldingDetailScreen } from '../features/asset/HoldingDetailScreen';
import { AddEventScreen } from '../features/asset/AddEventScreen';
import { RecordSellScreen } from '../features/asset/RecordSellScreen';
import { LogDividendScreen } from '../features/asset/LogDividendScreen';
import { AddLiabilityScreen } from '../features/liability/AddLiabilityScreen';
import { LiabilityDetailScreen } from '../features/liability/LiabilityDetailScreen';
import { ChartsScreen } from '../features/charts/ChartsScreen';
import { PortfolioComparisonScreen } from '../features/charts/PortfolioComparisonScreen';
import { AnalysisScreen } from '../features/analysis/AnalysisScreen';
import { theme } from '../utils/theme';
import { ProfileHeaderButton } from './ProfileHeaderButton';
import { PortfolioSelectorHeader } from '../features/portfolio/PortfolioSelectorHeader';

const Tab = createBottomTabNavigator();

/** Tab bar icon using emoji to avoid @expo/vector-icons / expo-font resolution issues. */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{emoji}</Text>
  );
}

const tabIcons = {
  Overview: (props: { focused: boolean }) => <TabIcon emoji="💼" focused={props.focused} />,
  Holdings: (props: { focused: boolean }) => <TabIcon emoji="📋" focused={props.focused} />,
  Charts: (props: { focused: boolean }) => <TabIcon emoji="📈" focused={props.focused} />,
  Insights: (props: { focused: boolean }) => <TabIcon emoji="📊" focused={props.focused} />,
};
const Stack = createNativeStackNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: theme.colors.background },
  headerTintColor: theme.colors.textPrimary,
  headerShadowVisible: false,
  contentStyle: { backgroundColor: theme.colors.background },
};

function ChartsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        ...screenOptions,
        headerRight: () => <ProfileHeaderButton />,
      }}
    >
      <Stack.Screen
        name="ChartsMain"
        component={ChartsScreen}
        options={{
          title: 'Breakdown',
          headerLeft: () => <PortfolioSelectorHeader />,
        }}
      />
      <Stack.Screen
        name="HoldingDetail"
        component={HoldingDetailScreen}
        options={{ title: 'Holding' }}
      />
      <Stack.Screen name="AddEvent" component={AddEventScreen} options={{ title: 'Add event' }} />
      <Stack.Screen name="RecordSell" component={RecordSellScreen} options={{ title: 'Record sell' }} />
      <Stack.Screen name="LogDividend" component={LogDividendScreen} options={{ title: 'Log dividend' }} />
      <Stack.Screen name="PortfolioComparison" component={PortfolioComparisonScreen} options={{ title: 'Compare Portfolios' }} />
    </Stack.Navigator>
  );
}

function HoldingsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: true,
        ...screenOptions,
      }}
    >
      <Stack.Screen
        name="HoldingsList"
        component={HoldingsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="HoldingDetail"
        component={HoldingDetailScreen}
        options={{ title: 'Holding' }}
      />
      <Stack.Screen name="AddEvent" component={AddEventScreen} options={{ title: 'Add event' }} />
      <Stack.Screen name="RecordSell" component={RecordSellScreen} options={{ title: 'Record sell' }} />
      <Stack.Screen name="LogDividend" component={LogDividendScreen} options={{ title: 'Log dividend' }} />
      <Stack.Screen name="AddAsset" component={AddAssetScreen} options={{ title: 'Add Asset' }} />
      <Stack.Screen name="AddLiability" component={AddLiabilityScreen} options={{ title: 'Add Liability' }} />
      <Stack.Screen name="LiabilityDetail" component={LiabilityDetailScreen} options={{ title: 'Liability' }} />
    </Stack.Navigator>
  );
}

/**
 * Main tab navigator: Overview, Holdings, Charts, Insights.
 * Settings is reached via profile icon in header (see RootNavigator).
 */
export function AppNavigation() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        ...screenOptions,
        headerRight: () => <ProfileHeaderButton />,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: theme.colors.border,
        },
        tabBarActiveTintColor: theme.colors.textPrimary,
        tabBarInactiveTintColor: theme.colors.textTertiary,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{
          title: 'Overview',
          tabBarIcon: tabIcons.Overview,
          headerLeft: () => <PortfolioSelectorHeader />,
        }}
      />
      <Tab.Screen
        name="Holdings"
        component={HoldingsStack}
        options={{
          title: 'Holdings',
          headerShown: false,
          tabBarIcon: tabIcons.Holdings,
        }}
      />
      <Tab.Screen
        name="Charts"
        component={ChartsStack}
        options={{
          title: 'Breakdown',
          headerShown: false,
          tabBarIcon: tabIcons.Charts,
        }}
      />
      <Tab.Screen
        name="Insights"
        component={AnalysisScreen}
        options={{
          title: 'Insights',
          tabBarIcon: tabIcons.Insights,
        }}
      />
    </Tab.Navigator>
  );
}
