'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Card,
  Flex,
  Group,
  Loader,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

type AvailableMonth = {
  month: number;
  year: number;
  recordsCount: number;
  label: string;
  monthName: string;
};

type WorkSummaryItem = {
  organization: {
    id: number;
    name: string;
    code?: string | null;
  };
  recordsCount: number;
  totalHours: number;
  totalKm: number;
  hourlyAmount: number;
  kmAmount: number;
  totalAmount: number;
  invoice: {
    status: string;
    invoiceNumber: string | null;
  } | null;
};

type Invoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  organization?: {
    id: number;
    name: string;
  };
};

type DashboardData = {
  workSummary: WorkSummaryItem[];
  invoices: Invoice[];
  pendingInvoices: any[];
  organizations: any[];
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function DashboardPage() {
  const now = dayjs();
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const [period, setPeriod] = useState<{ month: number; year: number }>({
    month: now.month() + 1,
    year: now.year(),
  });

  const availableMonthsQuery = useQuery<AvailableMonth[]>({
    queryKey: ['dashboard-available-months'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/work-records/available-months');
      return response.data;
    },
  });

  const dashboardQuery = useQuery<DashboardData>({
    queryKey: ['dashboard-data', period.year, period.month],
    enabled: Boolean(token),
    queryFn: async () => {
      const [summaryRes, invoicesRes, pendingRes, organizationsRes] = await Promise.all([
        api.get(`/work-records/summary/${period.year}/${period.month}`),
        api.get('/invoices', { params: { month: period.month, year: period.year } }),
        api.get('/received-invoices', { params: { status: 'PENDING' } }),
        api.get('/organizations'),
      ]);

      return {
        workSummary: summaryRes.data,
        invoices: invoicesRes.data.data,
        pendingInvoices: pendingRes.data,
        organizations: organizationsRes.data.data,
      };
    },
  });

  const availableMonths = availableMonthsQuery.data ?? [];

  useEffect(() => {
    if (availableMonths.length === 0) {
      return;
    }

    const hasCurrent = availableMonths.some(
      (item) => item.month === period.month && item.year === period.year,
    );

    if (!hasCurrent) {
      const currentMonth = now.month() + 1;
      const currentYear = now.year();
      const currentMatch = availableMonths.find(
        (item) => item.month === currentMonth && item.year === currentYear,
      );

      if (currentMatch) {
        setPeriod({ month: currentMatch.month, year: currentMatch.year });
      } else {
        const latest = availableMonths[0];
        setPeriod({ month: latest.month, year: latest.year });
      }
    }
  }, [availableMonths, now, period.month, period.year]);

  const monthSelectData = useMemo(
    () =>
      availableMonths.map((item) => ({
        value: `${item.month}/${item.year}`,
        label: `${item.monthName} (${item.recordsCount} záznamů)`,
      })),
    [availableMonths],
  );

  const selectedMonth = availableMonths.find(
    (item) => item.month === period.month && item.year === period.year,
  );

  const workSummary = dashboardQuery.data?.workSummary ?? [];
  const pendingInvoices = dashboardQuery.data?.pendingInvoices ?? [];

  const totalStats = useMemo(() => {
    if (workSummary.length === 0) {
      return {
        organizations: 0,
        toBill: 0,
        totalAmount: 0,
        totalHours: 0,
        totalKm: 0,
      };
    }

    const totals = workSummary.reduce(
      (acc, item) => {
        acc.organizations += 1;
        acc.totalAmount += item.totalAmount || 0;
        acc.totalHours += item.totalHours || 0;
        acc.totalKm += item.totalKm || 0;
        if (!item.invoice) {
          acc.toBill += 1;
        }
        return acc;
      },
      {
        organizations: 0,
        toBill: 0,
        totalAmount: 0,
        totalHours: 0,
        totalKm: 0,
      },
    );

    return totals;
  }, [workSummary]);

  const summaryTotals = useMemo(() => {
    return workSummary.reduce(
      (acc, item) => {
        acc.records += item.recordsCount || 0;
        acc.hours += item.totalHours || 0;
        acc.km += item.totalKm || 0;
        acc.hourlyAmount += item.hourlyAmount || 0;
        acc.kmAmount += item.kmAmount || 0;
        acc.totalAmount += item.totalAmount || 0;
        return acc;
      },
      {
        records: 0,
        hours: 0,
        km: 0,
        hourlyAmount: 0,
        kmAmount: 0,
        totalAmount: 0,
      },
    );
  }, [workSummary]);

  const yearAggregates = useMemo(() => {
    const monthsForYear = availableMonths.filter((item) => item.year === period.year);
    const records = monthsForYear.reduce((sum, item) => sum + item.recordsCount, 0);
    const uniqueMonths = monthsForYear.length;

    return {
      uniqueMonths,
      records,
      activeOrganizations: totalStats.organizations,
    };
  }, [availableMonths, period.year, totalStats.organizations]);

  const ocrSummary = useMemo(() => {
    const failed = pendingInvoices.filter((invoice) => invoice.ocrStatus === 'FAILED');
    const processing = pendingInvoices.filter((invoice) =>
      ['PENDING', 'PROCESSING'].includes(invoice.ocrStatus ?? ''),
    );
    const success = pendingInvoices.filter((invoice) => invoice.ocrStatus === 'SUCCESS');
    return {
      total: pendingInvoices.length,
      failed,
      processing,
      success,
    };
  }, [pendingInvoices]);

  if (!token) {
    return (
      <Flex align="center" justify="center" mih={300}>
        <Text>Přihlaste se prosím pro zobrazení dashboardu.</Text>
      </Flex>
    );
  }

  const isInitialLoading = availableMonthsQuery.isLoading || dashboardQuery.isLoading;

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>
            Dashboard {selectedMonth ? `– ${selectedMonth.monthName}` : ''}
          </Title>
          <Text c="dimmed" size="sm">
            Kompletní přehled práce, fakturace a upozornění pro vybrané období.
          </Text>
        </Stack>
        <Group gap="sm">
          <Select
            label="Měsíc"
            placeholder="Vyber měsíc"
            data={monthSelectData}
            value={`${period.month}/${period.year}`}
            onChange={(value) => {
              if (!value) return;
              const [month, year] = value.split('/').map(Number);
              setPeriod({ month, year });
            }}
            w={260}
            nothingFoundMessage="Žádné záznamy"
          />
          <NumberInput
            label="Rok"
            value={period.year}
            min={2018}
            max={2100}
            w={120}
            onChange={(val) => {
              const parsed = Number(val);
              if (!Number.isNaN(parsed)) {
                setPeriod((prev) => ({ ...prev, year: parsed }));
              }
            }}
          />
        </Group>
      </Group>

      {isInitialLoading ? (
        <Flex align="center" justify="center" mih={240}>
          <Loader color="blue" size="lg" />
        </Flex>
      ) : (
        <Stack gap="xl">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Card shadow="sm" radius="md" withBorder padding="lg">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Aktivní organizace
                </Text>
                <Title order={3}>{totalStats.organizations}</Title>
                <Text size="xs" c="dimmed">
                  s daty v aktuálním měsíci
                </Text>
              </Stack>
            </Card>
            <Card shadow="sm" radius="md" withBorder padding="lg" bg="orange.0">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Zbývá vyfakturovat
                </Text>
                <Title order={3} c="orange.7">
                  {totalStats.toBill}
                </Title>
                <Text size="xs" c="dimmed">
                  organizací nemá připravenou fakturu
                </Text>
              </Stack>
            </Card>
            <Card shadow="sm" radius="md" withBorder padding="lg" bg="blue.0">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Předpokládaná fakturace
                </Text>
                <Title order={3} c="blue.7">
                  {formatCurrency(totalStats.totalAmount)}
                </Title>
                <Text size="xs" c="dimmed">
                  součet práce a výjezdů v aktuálním měsíci
                </Text>
              </Stack>
            </Card>
            <Card shadow="sm" radius="md" withBorder padding="lg" bg="red.0">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Odpracované hodiny
                </Text>
                <Title order={3} c="red.7">
                  {totalStats.totalHours.toFixed(2)} h
                </Title>
                <Text size="xs" c="dimmed">
                  celkový čas techniků za zvolené období
                </Text>
              </Stack>
            </Card>
          </SimpleGrid>

          <Alert
            icon={<IconAlertTriangle size={20} />}
            title="Upozornění"
            color="yellow"
            variant="filled"
          >
            <Stack gap={6}>
              <Text size="sm">
                {totalStats.toBill} organizací ještě nemá vytvořenou fakturu pro tento měsíc.
              </Text>
              <Text size="sm">
                Zkontrolujte importy pracovních záznamů před generováním faktur.
              </Text>
              <Text size="sm">Technici ujeli celkem {totalStats.totalKm} km.</Text>
            </Stack>
          </Alert>

          {ocrSummary.total > 0 ? (
            <Card shadow="sm" radius="md" withBorder>
              <Stack gap="md">
                <Group justify="space-between" align="flex-start">
                  <Title order={4}>OCR stav přijatých faktur</Title>
                  <Group gap="xs">
                    <Badge color="red" variant={ocrSummary.failed.length ? 'filled' : 'light'}>
                      {ocrSummary.failed.length} selhalo
                    </Badge>
                    <Badge
                      color="yellow"
                      variant={ocrSummary.processing.length ? 'filled' : 'light'}
                    >
                      {ocrSummary.processing.length} čeká na OCR
                    </Badge>
                    <Badge color="green" variant={ocrSummary.success.length ? 'filled' : 'light'}>
                      {ocrSummary.success.length} připraveno
                    </Badge>
                  </Group>
                </Group>
                <ScrollArea>
                  <Table horizontalSpacing="md" verticalSpacing="sm" highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Dodavatel</Table.Th>
                        <Table.Th>Číslo faktury</Table.Th>
                        <Table.Th ta="center">Datum</Table.Th>
                        <Table.Th ta="right">Částka</Table.Th>
                        <Table.Th ta="center">OCR</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {pendingInvoices.map((invoice) => (
                        <Table.Tr key={invoice.id}>
                          <Table.Td>
                            <Stack gap={2} justify="center">
                              <Text fw={600}>{invoice.supplierName}</Text>
                              <Text size="xs" c="dimmed">
                                {invoice.status}
                              </Text>
                            </Stack>
                          </Table.Td>
                          <Table.Td>{invoice.invoiceNumber}</Table.Td>
                          <Table.Td ta="center">
                            {invoice.issueDate
                              ? dayjs(invoice.issueDate).format('DD.MM.YYYY')
                              : '—'}
                          </Table.Td>
                          <Table.Td ta="right">
                            {formatCurrency(invoice.totalWithVat ?? invoice.totalWithVatCents)}
                          </Table.Td>
                          <Table.Td ta="center">
                            <Badge
                              color={
                                invoice.ocrStatus === 'FAILED'
                                  ? 'red'
                                  : invoice.ocrStatus === 'SUCCESS'
                                  ? 'green'
                                  : 'yellow'
                              }
                              variant={
                                invoice.ocrStatus === 'FAILED'
                                  ? 'filled'
                                  : invoice.ocrStatus === 'SUCCESS'
                                  ? 'light'
                                  : 'light'
                              }
                            >
                              {invoice.ocrStatus === 'FAILED'
                                ? 'OCR selhalo'
                                : invoice.ocrStatus === 'SUCCESS'
                                ? 'OCR hotovo'
                                : 'Čeká na OCR'}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Stack>
            </Card>
          ) : null}

          <Card shadow="sm" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>Měsíční přehled organizací</Title>
              <ScrollArea>
                <Table horizontalSpacing="md" verticalSpacing="sm" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Organizace</Table.Th>
                      <Table.Th ta="center">Záznamy</Table.Th>
                      <Table.Th ta="center">Odpracované hodiny</Table.Th>
                      <Table.Th ta="center">Kilometry</Table.Th>
                      <Table.Th ta="right">Za hodiny</Table.Th>
                      <Table.Th ta="right">Za km</Table.Th>
                      <Table.Th ta="right">Celkem</Table.Th>
                      <Table.Th ta="center">Stav faktury</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {workSummary.map((item) => (
                      <Table.Tr key={item.organization.id}>
                        <Table.Td>
                          <Text fw={500}>{item.organization.name}</Text>
                        </Table.Td>
                        <Table.Td ta="center">{item.recordsCount}</Table.Td>
                        <Table.Td ta="center">{item.totalHours.toFixed(2)}</Table.Td>
                        <Table.Td ta="center">{item.totalKm}</Table.Td>
                        <Table.Td ta="right">{formatCurrency(item.hourlyAmount)}</Table.Td>
                        <Table.Td ta="right">{formatCurrency(item.kmAmount)}</Table.Td>
                        <Table.Td ta="right">
                          <Text fw={600}>{formatCurrency(item.totalAmount)}</Text>
                        </Table.Td>
                        <Table.Td ta="center">
                          {item.invoice ? (
                            <Badge
                              color={
                                item.invoice.status === 'PAID'
                                  ? 'green'
                                  : item.invoice.status === 'SENT'
                                  ? 'blue'
                                  : item.invoice.status === 'CANCELLED'
                                  ? 'gray'
                                  : 'yellow'
                              }
                            >
                              {item.invoice.status === 'DRAFT'
                                ? 'Koncept'
                                : item.invoice.status === 'SENT'
                                ? 'Odesláno'
                                : item.invoice.status === 'PAID'
                                ? 'Zaplaceno'
                                : item.invoice.status === 'CANCELLED'
                                ? 'Zrušeno'
                                : item.invoice.status}
                            </Badge>
                          ) : (
                            <Badge color="orange">Nevyfakturováno</Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                  <Table.Tfoot>
                    <Table.Tr>
                      <Table.Td fw={600}>Celkem</Table.Td>
                      <Table.Td ta="center">{summaryTotals.records}</Table.Td>
                      <Table.Td ta="center">{summaryTotals.hours.toFixed(2)}</Table.Td>
                      <Table.Td ta="center">{summaryTotals.km}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(summaryTotals.hourlyAmount)}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(summaryTotals.kmAmount)}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={700}>{formatCurrency(summaryTotals.totalAmount)}</Text>
                      </Table.Td>
                      <Table.Td />
                    </Table.Tr>
                  </Table.Tfoot>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card shadow="sm" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>Roční statistiky {period.year}</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
                <Card withBorder radius="md" padding="lg">
                  <Stack gap={4} align="center">
                    <Text size="lg" fw={700} c="green">
                      {yearAggregates.uniqueMonths}
                    </Text>
                    <Text c="dimmed" size="sm">
                      měsíců s daty
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder radius="md" padding="lg">
                  <Stack gap={4} align="center">
                    <Text size="lg" fw={700} c="blue">
                      {yearAggregates.records}
                    </Text>
                    <Text c="dimmed" size="sm">
                      celkem záznamů
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder radius="md" padding="lg">
                  <Stack gap={4} align="center">
                    <Text size="lg" fw={700} c="grape">
                      {yearAggregates.activeOrganizations}
                    </Text>
                    <Text c="dimmed" size="sm">
                      aktivních organizací
                    </Text>
                  </Stack>
                </Card>
                <Card withBorder radius="md" padding="lg">
                  <Stack gap={4} align="center">
                    <Text size="lg" fw={700} c="orange">
                      {period.month}/{period.year}
                    </Text>
                    <Text c="dimmed" size="sm">
                      vybraný měsíc
                    </Text>
                  </Stack>
                </Card>
              </SimpleGrid>
            </Stack>
          </Card>

          <Card shadow="sm" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>Aktuální faktury</Title>
                <Badge color="blue" variant="light">
                  {dashboardQuery.data?.invoices.length ?? 0} položek
                </Badge>
              </Group>
              {dashboardQuery.data?.invoices.length ? (
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  {dashboardQuery.data?.invoices.map((invoice) => (
                    <Card key={invoice.id} withBorder radius="md" padding="md">
                      <Stack gap={6}>
                        <Group justify="space-between" align="flex-start">
                          <div>
                            <Text fw={600}>{invoice.organization?.name ?? 'Organizace neznámá'}</Text>
                            <Text size="sm" c="dimmed">
                              {invoice.invoiceNumber}
                            </Text>
                          </div>
                          <Badge
                            color={
                              invoice.status === 'PAID'
                                ? 'green'
                                : invoice.status === 'SENT'
                                ? 'blue'
                                : invoice.status === 'CANCELLED'
                                ? 'gray'
                                : 'yellow'
                            }
                          >
                            {invoice.status}
                          </Badge>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">
                            Částka
                          </Text>
                          <Text fw={600}>{formatCurrency(invoice.totalAmount)}</Text>
                        </Group>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
              ) : (
                <Text c="dimmed" size="sm">
                  V tomto období nejsou k dispozici žádné faktury.
                </Text>
              )}
            </Stack>
          </Card>
        </Stack>
      )}
    </Stack>
  );
}
