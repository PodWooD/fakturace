'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

type ColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
  toggleColorScheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = 'fakturace:color-scheme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorScheme, setColorSchemeState] = useState<ColorScheme>('light');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY) as ColorScheme | null;
      if (stored === 'dark') {
        setColorSchemeState('dark');
        document.documentElement.setAttribute('data-mantine-color-scheme', 'dark');
      }
    }
  }, []);

  const setColorScheme = (scheme: ColorScheme) => {
    setColorSchemeState(scheme);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, scheme);
      document.documentElement.setAttribute('data-mantine-color-scheme', scheme);
    }
  };

  const toggleColorScheme = () => {
    setColorScheme(colorScheme === 'light' ? 'dark' : 'light');
  };

  const value = useMemo<ThemeContextValue>(
    () => ({ colorScheme, setColorScheme, toggleColorScheme }),
    [colorScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <MantineProvider
        defaultColorScheme="light"
        theme={{
          primaryColor: 'blue',
          fontFamily: 'Inter, sans-serif',
        }}
      >
        <Notifications position="top-right" />
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeSettings() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeSettings must be used within ThemeProvider');
  }
  return context;
}
