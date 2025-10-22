'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconRefresh } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function HardwarePage() {
  const now = dayjs();
  const { token, user } = useAuth();
  const canWrite = hasPermission(user?.role as UserRole, 'hardware:write');
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });
  const [organizationId, setOrganizationId] = useState<string>('');

  const organizationsQuery = useQuery({
    queryKey: ['hardware-organizations'],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/organizations');
      return res.data.data.map((org: any) => ({ value: String(org.id), label: org.name }));
    },
  });

  const pendingQuery = useQuery({
    queryKey: ['hardware-pending'],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/received-invoices/items/list', { params: { status: 'APPROVED' } });
      return res.data;
    },
  });

  const assignedQuery = useQuery({
    queryKey: ['hardware-assigned', period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/received-invoices/items/list', { params: { status: 'ASSIGNED' } });
      return res.data;
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (itemId: number) => {
      if (!canWrite) {
        throw new Error('Nedostatečná oprávnění');
      }
      return api.post('/hardware/assign', {
        itemId,
        organizationId: Number(organizationId),
        month: period.month,
        year: period.year,
      });
    },
    onSuccess: () => {
      notifications.show({ title: 'Přiřazeno', message: 'Položka byla přidána do hardware.', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['hardware-pending'] });
      queryClient.invalidateQueries({ queryKey: ['hardware-assigned'] });
    },
    onError: (error: any) => {
      if (error?.message === 'Nedostatečná oprávnění') {
        notifications.show({
          title: 'Nedostatečná oprávnění',
          message: 'Nemáte oprávnění přiřazovat hardware.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: 'Chyba',
        message: error?.response?.data?.error || 'Přiřazení položky selhalo.',
        color: 'red',
      });
    },
  });

  const organizations = organizationsQuery.data ?? [];

  const selectedOrganization = useMemo(
    () => organizations.find((org: any) => org.value === organizationId),
    [organizations, organizationId],
  );

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={2}>Hardware z přijatých faktur</Title>
        <Text c="dimmed" size="sm">
          Přehled položek, které lze přiřadit organizacím a zahrnout do fakturace hardware.
        </Text>
      </Stack>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group grow>
            <Select
              label="Organizace"
              placeholder="Vyberte organizaci"
              data={organizations}
              value={organizationId}
              onChange={(value) => setOrganizationId(value ?? '')}
              searchable
            />
            <MonthPickerInput
              label="Období přiřazení"
              value={dayjs().year(period.year).month(period.month - 1).toDate()}
              onChange={(value) => {
                if (!value) return;
                setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
              }}
            />
          </Group>
          {selectedOrganization ? (
            <Text size="xs" c="dimmed">
              Položky budou přiřazeny organizaci {selectedOrganization.label} pro období {period.month}/{period.year}.
            </Text>
          ) : null}
          <Text size="xs" c="dimmed">
            Položky budou přiřazeny do vybraného měsíce a organizace. Před přiřazením zkontrolujte, zda fakturace pro toto období ještě není uzamčena.
          </Text>
        </Stack>
      </Card>

      <Flex direction="column" gap="xl" align="stretch">
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>Nepřiřazené položky</Title>
              <Button
                variant="default"
                leftSection={<IconRefresh size={16} />}
                onClick={() => pendingQuery.refetch()}
                loading={pendingQuery.isRefetching}
              >
                Obnovit
              </Button>
            </Group>
            {pendingQuery.isLoading ? (
              <Flex align="center" justify="center" py="xl">
                <Loader color="blue" />
              </Flex>
            ) : pendingQuery.data?.length ? (
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Faktura</Table.Th>
                      <Table.Th>Položka</Table.Th>
                      <Table.Th ta="center">Množství</Table.Th>
                      <Table.Th ta="right">Cena</Table.Th>
                      <Table.Th ta="center">Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {pendingQuery.data.map((item: any) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={500}>{item.invoice?.invoiceNumber ?? '—'}</Text>
                            <Text size="xs" c="dimmed">
                              {item.invoice?.supplierName}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={500}>{item.itemName}</Text>
                            <Text size="xs" c="dimmed">
                              {item.description ?? '—'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td ta="center">{item.quantity ?? 1}</Table.Td>
                        <Table.Td ta="right">{formatCurrency(Number(item.totalPrice ?? 0))}</Table.Td>
                        <Table.Td ta="center">
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconCheck size={14} />}
                            disabled={!organizationId || !canWrite}
                            loading={assignMutation.isPending}
                            onClick={() => {
                              if (!canWrite) {
                                notifications.show({
                                  title: 'Nedostatečná oprávnění',
                                  message: 'Nemáte oprávnění přiřazovat hardware.',
                                  color: 'red',
                                });
                                return;
                              }
                              assignMutation.mutate(item.id);
                            }}
                          >
                            Přiřadit
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : (
              <Text c="dimmed">Žádné položky k přiřazení.</Text>
            )}
          </Stack>
        </Card>

        <Card withBorder radius="md" shadow="sm">
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Title order={4}>Přiřazené položky</Title>
              <Button
                variant="default"
                leftSection={<IconRefresh size={16} />}
                onClick={() => assignedQuery.refetch()}
                loading={assignedQuery.isRefetching}
              >
                Obnovit
              </Button>
            </Group>
            {assignedQuery.isLoading ? (
              <Flex align="center" justify="center" py="xl">
                <Loader color="blue" />
              </Flex>
            ) : assignedQuery.data?.length ? (
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Položka</Table.Th>
                      <Table.Th>Organizace</Table.Th>
                      <Table.Th ta="center">Období</Table.Th>
                      <Table.Th ta="right">Cena</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {assignedQuery.data.map((item: any) => (
                      <Table.Tr key={item.id}>
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={500}>{item.itemName}</Text>
                            <Text size="xs" c="dimmed">
                              {item.description ?? '—'}
                            </Text>
                          </Stack>
                        </Table.Td>
                        <Table.Td>{item.assignedOrganization?.name ?? '—'}</Table.Td>
                        <Table.Td ta="center">
                          {item.assignedMonth}/{item.assignedYear}
                        </Table.Td>
                        <Table.Td ta="right">{formatCurrency(Number(item.totalPrice ?? 0))}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            ) : (
              <Text c="dimmed">Žádný hardware není přiřazen.</Text>
            )}
          </Stack>
        </Card>
      </Flex>
    </Stack>
  );
}
