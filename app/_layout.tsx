import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { databaseName, migrateDatabase } from '@/data/database';
import '@/i18n';
import { useAppTheme } from '@/theme';

function LoadingFallback() {
  const { colors } = useAppTheme();
  const styles = makeStyles(colors.background);

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export default function RootLayout() {
  const { isDark } = useAppTheme();
  const styles = makeStyles(isDark ? '#0D1110' : '#F6F7F5');

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <Suspense fallback={<LoadingFallback />}>
          <SQLiteProvider databaseName={databaseName} onInit={migrateDatabase} useSuspense>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
            </Stack>
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const makeStyles = (backgroundColor: string) =>
  StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor,
  },
  });
