'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { IconDownload, IconPrinter } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function ReportsPage() {
  const now = dayjs();
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });

  const reportQuery = useQuery({
    queryKey: ['reports', period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get(`/work-records/summary/${period.year}/${period.month}`);
      return res.data;
    },
  });

  const data = reportQuery.data ?? [];

  const stats = useMemo(() => {
    if (!data.length) {
      return {
        organizations: 0,
        records: 0,
        hours: 0,
        kilometers: 0,
        totalAmount: 0,
        invoicedCount: 0,
        pendingCount: 0,
        invoicedAmount: 0,
        pendingAmount: 0,
      };
    }
    return data.reduce(
      (acc: any, item: any) => {
        acc.organizations += 1;
        acc.records += item.recordsCount ?? 0;
        acc.hours += Number(item.totalHours ?? 0);
        acc.kilometers += Number(item.totalKm ?? 0);
        const total = Number(item.totalAmount ?? 0);
        acc.totalAmount += total;
        if (item.invoice) {
          acc.invoicedCount += 1;
          acc.invoicedAmount += total;
        } else {
          acc.pendingCount += 1;
          acc.pendingAmount += total;
        }
        return acc;
      },
      {
        organizations: 0,
        records: 0,
        hours: 0,
        kilometers: 0,
        totalAmount: 0,
        invoicedCount: 0,
        pendingCount: 0,
        invoicedAmount: 0,
        pendingAmount: 0,
      },
    );
  }, [data]);

  const exportCsv = () => {
    const headers = [
      'Organizace',
      'Kód',
      'Počet záznamů',
      'Hodiny',
      'Km',
      'Za hodiny',
      'Za km',
      'Celkem',
      'Stav faktury',
    ];
    const rows = data.map((row: any) => [
      row.organization?.name ?? '',
      row.organization?.code ?? '',
      row.recordsCount ?? 0,
      row.totalHours ?? 0,
      row.totalKm ?? 0,
      row.hourlyAmount ?? 0,
      row.kmAmount ?? 0,
      row.totalAmount ?? 0,
      row.invoice ? row.invoice.status : 'Nevyfakturováno',
    ]);

    const csvContent = [headers.join(','), ...rows.map((row: (string | number)[]) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${period.year}-${String(period.month).padStart(2, '0')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const monthLabel = dayjs().year(period.year).month(period.month - 1).format('MMMM YYYY');

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Title order={2}>Měsíční report</Title>
          <Text c="dimmed" size="sm">
            Souhrn práce, kilometrovného a fakturace podle organizací pro vybraný měsíc.
          </Text>
        </Stack>
        <Group gap="sm">
          <Button variant="outline" leftSection={<IconDownload size={16} />} onClick={exportCsv} disabled={!data.length}>
            Export CSV
          </Button>
          <Button variant="light" leftSection={<IconPrinter size={16} />} onClick={() => window.print()} disabled={!data.length}>
            Tisk
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Group justify="space-between">
          <MonthPickerInput
            label="Období"
            value={dayjs().year(period.year).month(period.month - 1).toDate()}
            onChange={(value) => {
              if (!value) return;
              setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
            }}
          />
          <Badge size="lg" variant="light">
            {monthLabel}
          </Badge>
        </Group>
      </Card>

      {reportQuery.isLoading ? (
        <Flex align="center" justify="center" mih={240}>
          <Loader color="blue" />
        </Flex>
      ) : (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
            <Card withBorder radius="md" shadow="sm">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Organizací
                </Text>
                <Title order={3}>{stats.organizations}</Title>
              </Stack>
            </Card>
            <Card withBorder radius="md" shadow="sm">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Záznamů
                </Text>
                <Title order={3}>{stats.records}</Title>
              </Stack>
            </Card>
            <Card withBorder radius="md" shadow="sm">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Hodin
                </Text>
                <Title order={3}>{stats.hours.toFixed(2)}</Title>
              </Stack>
            </Card>
            <Card withBorder radius="md" shadow="sm">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Km
                </Text>
                <Title order={3}>{stats.kilometers}</Title>
              </Stack>
            </Card>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
            <Card withBorder radius="md" shadow="sm">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Celkem bez DPH
                </Text>
                <Title order={3}>{formatCurrency(stats.totalAmount)}</Title>
              </Stack>
            </Card>
            <Card withBorder radius="md" shadow="sm" bg="green.0">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  Vyfakturováno
                </Text>
                <Title order={3} c="green.7">
                  {formatCurrency(stats.invoicedAmount)}
                </Title>
                <Text size="xs" c="green.7">
                  {stats.invoicedCount} organizací
                </Text>
              </Stack>
            </Card>
            <Card withBorder radius="md" shadow="sm" bg="orange.0">
              <Stack align="center" gap={4}>
                <Text size="sm" c="dimmed">
                  K vyfakturování
                </Text>
                <Title order={3} c="orange.7">
                  {formatCurrency(stats.pendingAmount)}
                </Title>
                <Text size="xs" c="orange.7">
                  {stats.pendingCount} organizací
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="sm">
              <Title order={4}>Podrobnosti podle organizací</Title>
              {data.length ? (
                <ScrollArea>
                  <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Organizace</Table.Th>
                        <Table.Th ta="center">Záznamy</Table.Th>
                        <Table.Th ta="center">Hodiny</Table.Th>
                        <Table.Th ta="center">Kilometry</Table.Th>
                        <Table.Th ta="right">Za hodiny</Table.Th>
                        <Table.Th ta="right">Za km</Table.Th>
                        <Table.Th ta="right">Celkem</Table.Th>
                        <Table.Th ta="center">Stav faktury</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.map((row: any) => (
                        <Table.Tr key={row.organization?.id ?? row.organization?.name}>
                          <Table.Td>
                            <Stack gap={2}>
                              <Text fw={500}>{row.organization?.name}</Text>
                              <Text size="xs" c="dimmed">
                                {row.organization?.code}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td ta="center">{row.recordsCount}</Table.Td>
                          <Table.Td ta="center">{Number(row.totalHours ?? 0).toFixed(2)}</Table.Td>
                          <Table.Td ta="center">{row.totalKm}</Table.Td>
                          <Table.Td ta="right">{formatCurrency(Number(row.hourlyAmount ?? 0))}</Table.Td>
                          <Table.Td ta="right">{formatCurrency(Number(row.kmAmount ?? 0))}</Table.Td>
                          <Table.Td ta="right">{formatCurrency(Number(row.totalAmount ?? 0))}</Table.Td>
                          <Table.Td ta="center">
                            {row.invoice ? (
                              <Badge color={row.invoice.status === 'PAID' ? 'green' : 'blue'}>
                                {row.invoice.status}
                              </Badge>
                            ) : (
                              <Badge color="orange">Nevyfakturováno</Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              ) : (
                <Flex align="center" justify="center" py="xl">
                  <Text c="dimmed">Pro vybrané období nejsou k dispozici žádná data.</Text>
                </Flex>
              )}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
