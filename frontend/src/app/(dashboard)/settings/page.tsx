'use client';

import Link from 'next/link';
import { ActionIcon, Card, Group, SegmentedControl, Stack, Text, Title, Alert, Button } from '@mantine/core';
import { IconMoonStars, IconSun, IconUsers } from '@tabler/icons-react';
import { useThemeSettings } from '@/lib/theme-context';
import { useAuth } from '@/lib/auth-context';
import { hasPermission, type UserRole } from '@/lib/permissions';

export default function SettingsPage() {
  const { colorScheme, setColorScheme, toggleColorScheme } = useThemeSettings();
  const { user } = useAuth();
  const canManageUsers = hasPermission(user?.role as UserRole, 'users:manage');

  return (
    <Stack gap="xl">
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={3}>Motiv aplikace</Title>
            <Group gap="xs">
              <ActionIcon variant="subtle" onClick={toggleColorScheme} aria-label="Přepnout motiv">
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoonStars size={18} />}
              </ActionIcon>
              <SegmentedControl
                value={colorScheme}
                onChange={(value) => setColorScheme(value as 'light' | 'dark')}
                data={[
                  { label: 'Světlý', value: 'light' },
                  { label: 'Tmavý', value: 'dark' },
                ]}
              />
            </Group>
          </Group>
          <Text c="dimmed" size="sm">
            Nastavený motiv se ukládá do prohlížeče a použije se při příštím přihlášení.
          </Text>
        </Stack>
      </Card>

      {canManageUsers && (
        <Alert
          variant="light"
          color="blue"
          icon={<IconUsers size={18} />}
          title="Správa uživatelů"
        >
          <Stack gap="xs">
            <Text size="sm">Vytváření a úpravy uživatelů najdete nově v samostatné sekci.</Text>
            <Group>
              <Button component={Link} href="/users" size="xs">
                Otevřít správu uživatelů
              </Button>
            </Group>
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}
