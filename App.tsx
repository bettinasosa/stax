import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { SQLiteProvider } from 'expo-sqlite';
import { View, Text, ActivityIndicator } from 'react-native';
import { AuthProvider } from './src/contexts/AuthContext';
import { RootNavigator } from './src/app/RootNavigator';
import { initDb, DB_NAME } from './src/data/db';
import { configureRevenueCat } from './src/services/revenuecat';
import { theme } from './src/utils/theme';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold, Fraunces_700Bold } from '@expo-google-fonts/fraunces';

configureRevenueCat();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <ActivityIndicator size="large" color={theme.colors.textPrimary} />
        <Text
          style={{ marginTop: theme.spacing.sm, color: theme.colors.textSecondary, fontSize: 14 }}
        >
          Loading…
        </Text>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <SQLiteProvider databaseName={DB_NAME} onInit={initDb}>
        <RootNavigator />
        <StatusBar style="light" />
      </SQLiteProvider>
    </AuthProvider>
  );
}
