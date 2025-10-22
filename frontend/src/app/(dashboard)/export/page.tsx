'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Flex,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

const statusLabels: Record<string, string> = {
  DRAFT: 'Koncept',
  SENT: 'Odesláno',
  PAID: 'Zaplaceno',
  CANCELLED: 'Zrušeno',
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function ExportPage() {
  const now = dayjs();
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });
  const [selected, setSelected] = useState<number[]>([]);

  const invoicesQuery = useQuery({
    queryKey: ['export-invoices', period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/invoices', {
        params: {
          month: period.month,
          year: period.year,
          limit: 200,
        },
      });
      return res.data.data;
    },
  });

  const invoices = invoicesQuery.data ?? [];

  const exportBatchMutation = useMutation({
    mutationFn: async (ids: number[]) =>
      api.post('/invoices/export-batch', { invoiceIds: ids }, { responseType: 'blob' }),
    onSuccess: (response) => {
      const blob = response.data;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pohoda-export-${period.year}-${String(period.month).padStart(2, '0')}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      notifications.show({ title: 'Hotovo', message: 'Export byl stažen.', color: 'green' });
      setSelected([]);
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Chyba',
        message: error?.response?.data?.error || 'Export selhal.',
        color: 'red',
      });
    },
  });

  const exportSingle = async (id: number) => {
    if (!token) return;
    const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/invoices/${id}/export`;
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      notifications.show({ title: 'Chyba', message: 'Nepodařilo se stáhnout export', color: 'red' });
      return;
    }
    const blob = await response.blob();
    const invoice = invoices.find((item: any) => item.id === id);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pohoda-${invoice?.invoiceNumber ?? id}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const toggleSelection = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selected.length === invoices.length) {
      setSelected([]);
    } else {
      setSelected(invoices.map((invoice: any) => invoice.id));
    }
  };

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={2}>Export do Pohoda XML</Title>
        <Text c="dimmed" size="sm">
          Vyberte faktury a stáhněte hromadný nebo jednotlivý export ve formátu kompatibilním s Pohodou.
        </Text>
      </Stack>

      <Card withBorder radius="md" shadow="sm">
        <Group justify="space-between" align="flex-end">
          <MonthPickerInput
            label="Období faktur"
            value={dayjs().year(period.year).month(period.month - 1).toDate()}
            onChange={(value) => {
              if (!value) return;
              setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
              setSelected([]);
            }}
          />
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => invoicesQuery.refetch()}
            loading={invoicesQuery.isRefetching}
          >
            Obnovit seznam
          </Button>
        </Group>
      </Card>

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
                  <Table.Th>
                    <Checkbox
                      checked={selected.length === invoices.length}
                      indeterminate={selected.length > 0 && selected.length < invoices.length}
                      onChange={toggleAll}
                    />
                  </Table.Th>
                  <Table.Th>Číslo faktury</Table.Th>
                  <Table.Th>Organizace</Table.Th>
                  <Table.Th ta="center">Datum</Table.Th>
                  <Table.Th ta="right">Částka</Table.Th>
                  <Table.Th ta="center">Stav</Table.Th>
                  <Table.Th ta="right">Export</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invoices.map((invoice: any) => (
                  <Table.Tr key={invoice.id}>
                    <Table.Td>
                      <Checkbox
                        checked={selected.includes(invoice.id)}
                        onChange={() => toggleSelection(invoice.id)}
                      />
                    </Table.Td>
                    <Table.Td>{invoice.invoiceNumber}</Table.Td>
                    <Table.Td>{invoice.organization?.name ?? '—'}</Table.Td>
                    <Table.Td ta="center">
                      {invoice.generatedAt ? dayjs(invoice.generatedAt).format('DD.MM.YYYY') : '—'}
                    </Table.Td>
                    <Table.Td ta="right">
                      {formatCurrency((invoice.totalAmount ?? 0) + (invoice.totalVat ?? 0))}
                    </Table.Td>
                    <Table.Td ta="center">
                      <Badge>{statusLabels[invoice.status] ?? invoice.status}</Badge>
                    </Table.Td>
                    <Table.Td ta="right">
                      <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={() => exportSingle(invoice.id)}>
                        Exportovat
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : (
          <Flex align="center" justify="center" py="xl">
            <Text c="dimmed">Pro vybrané období nejsou dostupné žádné faktury.</Text>
          </Flex>
        )}
      </Card>

      <Alert color="blue" variant="light">
        Vybráno {selected.length} faktur. Export "Hromadně" stáhne jeden XML soubor se všemi zvolenými položkami.
      </Alert>

      <Group justify="flex-end" gap="sm">
        <Button
          variant="outline"
          leftSection={<IconDownload size={16} />}
          disabled={selected.length === 0}
          loading={exportBatchMutation.isPending}
          onClick={() => exportBatchMutation.mutate(selected)}
        >
          Hromadně (XML)
        </Button>
      </Group>
    </Stack>
  );
}
