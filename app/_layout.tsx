import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useStore } from '@/store/useStore';
import { colors, useTheme, useThemeStore } from '@/theme';
import { Loader, ToastHost } from '@/ui';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);
  const themeReady = useThemeStore((s) => s.ready);
  const loadTheme = useThemeStore((s) => s.load);
  const { resolved } = useTheme();

  useEffect(() => {
    // Theme first so the very first frame is already the right colour, then the data.
    void loadTheme().then(() => boot());
  }, [boot, loadTheme]);

  useEffect(() => {
    if (ready && themeReady) void SplashScreen.hideAsync();
  }, [ready, themeReady]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
        {ready && themeReady ? (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sign-in" options={{ animation: 'fade' }} />
            <Stack.Screen name="reset-password" options={{ animation: 'fade' }} />
            <Stack.Screen name="bill/[id]" />
            <Stack.Screen name="customer/[id]" />
          </Stack>
        ) : (
          <Loader message="Opening the till" />
        )}
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
