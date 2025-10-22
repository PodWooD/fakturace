import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './globals.css';

import { ColorSchemeScript } from '@mantine/core';
import type { Metadata } from 'next';
import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: 'Fakturace v1.0',
  description: 'Fakturace a billing platforma',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
