'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  Modal,
  Pagination,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import {
  IconArrowRight,
  IconFileDownload,
  IconPlus,
  IconRefresh,
  IconSearch,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';

const statusLabels: Record<string, string> = {
  DRAFT: 'Koncept',
  SENT: 'Odesláno',
  PAID: 'Zaplaceno',
  CANCELLED: 'Zrušeno',
};

const statusColors: Record<string, string> = {
  DRAFT: 'gray',
  SENT: 'blue',
  PAID: 'green',
  CANCELLED: 'red',
};

const statusOptions = [
  { value: '', label: 'Všechny stavy' },
  { value: 'DRAFT', label: 'Koncept' },
  { value: 'SENT', label: 'Odesláno' },
  { value: 'PAID', label: 'Zaplaceno' },
  { value: 'CANCELLED', label: 'Zrušeno' },
];

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function InvoicesPage() {
  const now = dayjs();
  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });
  const [filters, setFilters] = useState<{ status: string; query: string }>({ status: '', query: '' });
  const [pagination, setPagination] = useState<{ page: number; limit: number }>({ page: 1, limit: 20 });
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);

  const { token, user } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const queryClient = useQueryClient();
  const role = user?.role as UserRole;
  const canGenerate = hasPermission(role, 'invoices:generate');
  const canExport = hasPermission(role, 'invoices:export');
  const canDelete = hasPermission(role, 'invoices:delete');

  const organizationsQuery = useQuery({
    queryKey: ['organizations-options'],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/organizations');
      return res.data.data.map((org: any) => ({ value: String(org.id), label: org.name }));
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['invoices', period, filters, pagination.page, pagination.limit],
    enabled: Boolean(token),
    queryFn: async () => {
      const params: Record<string, any> = {
        month: period.month,
        year: period.year,
        page: pagination.page,
        limit: pagination.limit,
      };
      if (filters.status) params.status = filters.status;
      if (filters.query) params.search = filters.query;
      const res = await api.get('/invoices', { params });
      return res.data;
    },
  });

  const invoices = invoicesQuery.data?.data ?? [];
  const paginationInfo = invoicesQuery.data?.pagination ?? {
    page: pagination.page,
    pages: 1,
    limit: pagination.limit,
    total: invoices.length,
  };

  const stats = useMemo(() => {
    if (!invoices.length) {
      return { totalAmount: 0, unpaid: 0, paid: 0, count: 0 };
    }
    return invoices.reduce(
      (acc: any, invoice: any) => {
        const total = (invoice.totalAmount ?? 0) + (invoice.totalVat ?? 0);
        acc.totalAmount += total;
        if (invoice.status === 'PAID') {
          acc.paid += total;
        } else if (invoice.status === 'SENT' || invoice.status === 'DRAFT') {
          acc.unpaid += total;
        }
        acc.count += 1;
        return acc;
      },
      { totalAmount: 0, unpaid: 0, paid: 0, count: 0 },
    );
  }, [invoices]);

  const generateMutation = useMutation({
    mutationFn: async (organizationId: number) => {
      if (!canGenerate) {
        throw new Error('Nedostatečná oprávnění');
      }
      return api.post('/invoices/generate', {
        organizationId,
        month: period.month,
        year: period.year,
      });
    },
    onSuccess: () => {
      notifications.show({
        title: 'Faktura vygenerována',
        message: 'Faktura byla úspěšně vytvořena.',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      setGenerateModalOpen(false);
      setSelectedOrg(null);
    },
    onError: (error: any) => {
      if (error?.message === 'Nedostatečná oprávnění') {
        notifications.show({
          title: 'Nedostatečná oprávnění',
          message: 'Nemáte oprávnění vytvářet faktury.',
          color: 'red',
        });
        return;
      }
      notifications.show({
        title: 'Chyba',
        message: error?.response?.data?.error || 'Nepodařilo se vytvořit fakturu.',
        color: 'red',
      });
    },
  });

  const handleDownload = async (invoiceId: number, type: 'pdf' | 'pohoda' | 'isdoc') => {
    if (!token) return;
    if (!canExport) {
      notifications.show({
        title: 'Nedostatečná oprávnění',
        message: 'Nemáte oprávnění exportovat faktury.',
        color: 'red',
      });
      return;
    }
    const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/invoices/${invoiceId}/${
      type === 'pdf' ? 'pdf' : type === 'pohoda' ? 'pohoda-xml' : 'isdoc'
    }`;

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      notifications.show({ title: 'Chyba', message: 'Nepodařilo se stáhnout soubor.', color: 'red' });
      return;
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const extension = type === 'pdf' ? 'pdf' : type === 'pohoda' ? 'xml' : 'isdoc';
    link.download = `invoice-${invoiceId}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const selectedDate = dayjs().year(period.year).month(period.month - 1).date(1).toDate();

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Title order={2}>Faktury</Title>
          <Text c="dimmed" size="sm">
            Přehled generovaných faktur, filtrování podle období a rychlé exporty.
          </Text>
        </Stack>
        <Group gap="sm">
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => invoicesQuery.refetch()}
            loading={invoicesQuery.isRefetching}
          >
            Obnovit
          </Button>
          {canGenerate ? (
            <Button component={Link} href="/invoices/new" variant="light">
              Pokročilé vytvoření
            </Button>
          ) : null}
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              if (!canGenerate) {
                notifications.show({
                  title: 'Nedostatečná oprávnění',
                  message: 'Nemáte oprávnění vytvářet faktury.',
                  color: 'red',
                });
                return;
              }
              setGenerateModalOpen(true);
            }}
            disabled={!canGenerate}
          >
            Rychlé vygenerování
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group grow align="flex-end">
            <MonthPickerInput
              label="Období"
              value={selectedDate}
              onChange={(value) => {
                if (!value) return;
                setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            />
            <Select
              label="Stav"
              data={statusOptions}
              value={filters.status}
              onChange={(value) => {
                setFilters((prev) => ({ ...prev, status: value ?? '' }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            />
            <TextInput
              label="Vyhledat"
              placeholder="Číslo faktury nebo organizace"
              leftSection={<IconSearch size={16} />}
              value={filters.query}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, query: event.currentTarget.value }));
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
            />
          </Group>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <Card withBorder radius="md" shadow="sm">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Celkem fakturováno
            </Text>
            <Title order={3}>{formatCurrency(stats.totalAmount)}</Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="orange.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Nezaplacené
            </Text>
            <Title order={3} c="orange.7">
              {formatCurrency(stats.unpaid)}
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="green.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Zaplacené
            </Text>
            <Title order={3} c="green.7">
              {formatCurrency(stats.paid)}
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="blue.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Počet faktur
            </Text>
            <Title order={3} c="blue.7">
              {stats.count}
            </Title>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" shadow="sm">
        {invoicesQuery.isLoading ? (
          <Flex align="center" justify="center" py="xl">
            <Loader color="blue" />
          </Flex>
        ) : invoices.length ? (
          <ScrollArea>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Číslo faktury</Table.Th>
                  <Table.Th>Organizace</Table.Th>
                  <Table.Th ta="center">Datum vytvoření</Table.Th>
                  <Table.Th ta="right">Bez DPH</Table.Th>
                  <Table.Th ta="right">DPH</Table.Th>
                  <Table.Th ta="right">Celkem</Table.Th>
                  <Table.Th ta="center">Stav</Table.Th>
                  <Table.Th ta="right">Akce</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invoices.map((invoice: any) => {
                  const total = (invoice.totalAmount ?? 0) + (invoice.totalVat ?? 0);
                  return (
                    <Table.Tr key={invoice.id}>
                      <Table.Td fw={600}>{invoice.invoiceNumber}</Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text fw={500}>{invoice.organization?.name ?? '—'}</Text>
                          <Text size="xs" c="dimmed">
                            IČO: {invoice.organization?.ico ?? 'neuvedeno'}
                          </Text>
                        </Stack>
                      </Table.Td>
                      <Table.Td ta="center">
                        {invoice.generatedAt ? dayjs(invoice.generatedAt).format('DD.MM.YYYY') : '—'}
                      </Table.Td>
                      <Table.Td ta="right">{formatCurrency(invoice.totalAmount)}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(invoice.totalVat)}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={600}>{formatCurrency(total)}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge color={statusColors[invoice.status] ?? 'gray'}>
                          {statusLabels[invoice.status] ?? invoice.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        <Group gap="xs" justify="flex-end">
                          <ActionIcon
                            component={Link}
                            href={`/invoices/${invoice.id}`}
                            variant="subtle"
                            aria-label="Detail"
                          >
                            <IconArrowRight size={18} />
                          </ActionIcon>
                          <Button
                            size="xs"
                            variant="light"
                            leftSection={<IconFileDownload size={14} />}
                            onClick={() => handleDownload(invoice.id, 'pdf')}
                            disabled={!canExport}
                          >
                            PDF
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            leftSection={<IconFileDownload size={14} />}
                            onClick={() => handleDownload(invoice.id, 'pohoda')}
                            disabled={!canExport}
                          >
                            Pohoda XML
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            leftSection={<IconFileDownload size={14} />}
                            onClick={() => handleDownload(invoice.id, 'isdoc')}
                            disabled={!canExport}
                          >
                            ISDOC
                          </Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : (
          <Flex align="center" justify="center" py="xl">
            <Text c="dimmed">Pro zvolené období nejsou dostupné žádné faktury.</Text>
          </Flex>
        )}
        <Group justify="space-between" align="center" mt="md">
          <Text size="sm" c="dimmed">
            Stránka {paginationInfo.page} z {paginationInfo.pages} • Celkem {paginationInfo.total} záznamů
          </Text>
          <Pagination
            value={paginationInfo.page}
            onChange={(page) => setPagination((prev) => ({ ...prev, page }))}
            total={Math.max(paginationInfo.pages, 1)}
          />
        </Group>
      </Card>

      <Modal
        opened={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        title="Rychlé vytvoření faktury"
        size="lg"
      >
        <Stack gap="sm">
          <Text size="sm">
            Faktura bude vygenerována pro aktuálně vybraný měsíc ({period.month}/{period.year}).
          </Text>
          <Select
            label="Organizace"
            placeholder="Vyberte organizaci"
            data={organizationsQuery.data || []}
            value={selectedOrg}
            onChange={setSelectedOrg}
            searchable
            nothingFoundMessage="Žádná organizace"
          />
          <Button
            disabled={!selectedOrg || !canGenerate}
            loading={generateMutation.isPending}
            onClick={() => selectedOrg && canGenerate && generateMutation.mutate(Number(selectedOrg))}
          >
            Vytvořit fakturu
          </Button>
          <Text size="xs" c="dimmed">
            Potřebujete náhled položek před vytvořením? Použijte stránku{' '}
            <Button component={Link} variant="subtle" size="xs" href="/invoices/new">
              Pokročilé vytvoření
            </Button>
          </Text>
        </Stack>
      </Modal>
    </Stack>
  );
}
