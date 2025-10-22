'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import queryClient from '../lib/query-client';
import { AuthProvider } from '../lib/auth-context';
import { ThemeProvider } from '../lib/theme-context';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          {children}
          <ReactQueryDevtools initialIsOpen={false} />
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
