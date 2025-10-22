'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AppShell,
  Burger,
  Button,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconBuilding,
  IconChartBar,
  IconFileExport,
  IconFileInvoice,
  IconHome,
  IconListDetails,
  IconReceipt2,
  IconSettings,
  IconUpload,
  IconUsers,
  IconCpu,
} from '@tabler/icons-react';
import { useAuth } from '../../lib/auth-context';
import { hasPermission, type PermissionKey, type UserRole } from '../../lib/permissions';

const navLinks: Array<{
  href: string;
  label: string;
  icon: typeof IconHome;
  permission?: PermissionKey;
}> = [
  { href: '/', label: 'Dashboard', icon: IconHome },
  { href: '/organizations', label: 'Organizace', icon: IconBuilding },
  { href: '/work-records', label: 'Pracovní záznamy', icon: IconListDetails },
  { href: '/received-invoices', label: 'Přijaté faktury', icon: IconReceipt2 },
  { href: '/invoices', label: 'Fakturace', icon: IconFileInvoice },
  { href: '/hardware', label: 'Hardware', icon: IconCpu },
  { href: '/import', label: 'Import', icon: IconUpload, permission: 'receivedInvoices:ocr' },
  { href: '/export', label: 'Export', icon: IconFileExport, permission: 'invoices:export' },
  { href: '/reports', label: 'Reporty', icon: IconChartBar },
  { href: '/billing', label: 'Billing', icon: IconUsers, permission: 'billing:read' },
];

export const AppShellLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [opened, { toggle }] = useDisclosure(false);

  const active = useMemo(() => pathname ?? '/', [pathname]);

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <AppShell
      padding="md"
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { mobile: !opened } }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Title order={4}>Fakturace v1.0</Title>
          </Group>
          <Group gap="sm">
            <Stack gap={0} align="flex-end">
              <Text fw={600}>{user?.name}</Text>
              <Text size="xs" c="dimmed">
                {user?.role}
              </Text>
            </Stack>
            <Button variant="default" size="xs" onClick={handleLogout}>
              Odhlásit
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <AppShell.Section grow component={ScrollArea}>
          <Stack gap="xs">
            {navLinks
              .filter((link) => (link.permission ? hasPermission(user?.role as UserRole, link.permission) : true))
              .map((link) => (
                <NavLink
                  key={link.href}
                  component={Link}
                  href={link.href}
                  label={link.label}
                  leftSection={<link.icon size={18} />}
                  active={active === link.href}
                />
              ))}
          </Stack>
        </AppShell.Section>
        <AppShell.Section>
          <NavLink
            component={Link}
            href="/settings"
            label="Nastavení"
            leftSection={<IconSettings size={18} />}
            active={active === '/settings'}
          />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>{children}</div>
      </AppShell.Main>
    </AppShell>
  );
};
