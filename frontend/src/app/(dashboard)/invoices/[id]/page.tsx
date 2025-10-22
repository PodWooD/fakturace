'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMemo } from 'react';
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
import { IconArrowLeft, IconFileDownload } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { notifications } from '@mantine/notifications';

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${rest.toString().padStart(2, '0')}`;
};

const formatDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const invoiceQuery = useQuery({
    queryKey: ['invoice-detail', id],
    enabled: Boolean(token && id),
    queryFn: async () => {
      const response = await api.get(`/invoices/${id}`);
      return response.data;
    },
  });

  if (!token) {
    return (
      <Flex align="center" justify="center" mih={200}>
        <Text>Přihlaste se prosím pro zobrazení detailu faktury.</Text>
      </Flex>
    );
  }

  if (invoiceQuery.isLoading) {
    return (
      <Flex align="center" justify="center" mih={240}>
        <Loader color="blue" />
      </Flex>
    );
  }

  if (invoiceQuery.isError || !invoiceQuery.data) {
    return notFound();
  }

  const invoice = invoiceQuery.data;
  const organization = invoice.organization ?? {};

  const summary = useMemo(() => {
    const hourlyRate = Number(organization.hourlyRate ?? 0);
    const kmRate = Number(organization.kilometerRate ?? organization.kmRate ?? 0);
    const totalMinutes = invoice.workRecords?.reduce((sum: number, record: any) => sum + (record.minutes ?? 0), 0) ?? 0;
    const totalKm = invoice.workRecords?.reduce((sum: number, record: any) => sum + (record.kilometers ?? 0), 0) ?? 0;
    const workAmount = invoice.workRecords?.reduce(
      (sum: number, record: any) => sum + ((record.minutes ?? 0) / 60) * hourlyRate,
      0,
    ) ?? 0;
    const kmAmount = totalKm * kmRate;
    const servicesAmount = invoice.services?.reduce(
      (sum: number, service: any) => sum + Number(service.monthlyPrice ?? 0),
      0,
    ) ?? 0;
    const hardwareAmount = invoice.hardware?.reduce(
      (sum: number, item: any) => sum + Number(item.totalPrice ?? 0),
      0,
    ) ?? 0;

    return {
      totalMinutes,
      totalKm,
      workAmount,
      kmAmount,
      servicesAmount,
      hardwareAmount,
      totalAmount: workAmount + kmAmount + servicesAmount + hardwareAmount,
    };
  }, [invoice.hardware, invoice.services, invoice.workRecords, organization.hourlyRate, organization.kilometerRate, organization.kmRate]);

  const downloadFile = async (type: 'pdf' | 'pohoda' | 'isdoc') => {
    if (!token) return;
    const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/invoices/${invoice.id}/${
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
    link.download = `invoice-${invoice.invoiceNumber}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const periodLabel = dayjs().year(invoice.year).month(invoice.month - 1).format('MMMM YYYY');

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Button component={Link} href="/invoices" variant="default" leftSection={<IconArrowLeft size={16} />}>
            Zpět na seznam
          </Button>
          <Title order={2}>Faktura {invoice.invoiceNumber}</Title>
        </Group>
        <Group gap="sm">
          <Button variant="light" leftSection={<IconFileDownload size={16} />} onClick={() => downloadFile('pdf')}>
            PDF
          </Button>
          <Button variant="outline" leftSection={<IconFileDownload size={16} />} onClick={() => downloadFile('pohoda')}>
            Pohoda XML
          </Button>
          <Button variant="outline" leftSection={<IconFileDownload size={16} />} onClick={() => downloadFile('isdoc')}>
            ISDOC
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Text size="sm" c="dimmed">
                Období
              </Text>
              <Title order={4}>{periodLabel}</Title>
            </Stack>
            <Badge>{invoice.status}</Badge>
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
            <Card padding="md" withBorder radius="md">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Organizace
                </Text>
                <Text fw={600}>{organization.name}</Text>
                <Text size="xs" c="dimmed">
                  IČO: {organization.ico ?? 'neuvedeno'}
                </Text>
              </Stack>
            </Card>
            <Card padding="md" withBorder radius="md">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Hodinová sazba
                </Text>
                <Text fw={600}>{formatCurrency(Number(organization.hourlyRate ?? 0))}/hod</Text>
              </Stack>
            </Card>
            <Card padding="md" withBorder radius="md">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Sazba za km
                </Text>
                <Text fw={600}>{formatCurrency(Number(organization.kilometerRate ?? organization.kmRate ?? 0))}/km</Text>
              </Stack>
            </Card>
            <Card padding="md" withBorder radius="md">
              <Stack gap={4}>
                <Text size="sm" c="dimmed">
                  Celkem
                </Text>
                <Text fw={700}>{formatCurrency(Number(invoice.totalAmount ?? 0) + Number(invoice.totalVat ?? 0))}</Text>
              </Stack>
            </Card>
          </SimpleGrid>
        </Stack>
      </Card>

      {invoice.workRecords?.length ? (
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="sm">
            <Title order={4}>Pracovní záznamy</Title>
            <ScrollArea>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Datum</Table.Th>
                    <Table.Th>Technik</Table.Th>
                    <Table.Th>Popis</Table.Th>
                    <Table.Th ta="center">Čas</Table.Th>
                    <Table.Th ta="center">Kilometry</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invoice.workRecords.map((record: any) => (
                    <Table.Tr key={record.id}>
                      <Table.Td>{formatDate(record.date)}</Table.Td>
                      <Table.Td>{record.worker}</Table.Td>
                      <Table.Td>{record.description}</Table.Td>
                      <Table.Td ta="center">{formatMinutes(record.minutes ?? 0)}</Table.Td>
                      <Table.Td ta="center">{record.kilometers ?? 0}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>
      ) : null}

      {invoice.services?.length ? (
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="sm">
            <Title order={4}>Paušální služby</Title>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Název</Table.Th>
                  <Table.Th>Popis</Table.Th>
                  <Table.Th ta="right">Částka</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invoice.services.map((service: any) => (
                  <Table.Tr key={service.id}>
                    <Table.Td>{service.serviceName}</Table.Td>
                    <Table.Td>{service.description ?? '—'}</Table.Td>
                    <Table.Td ta="right">{formatCurrency(Number(service.monthlyPrice ?? 0))}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      ) : null}

      {invoice.hardware?.length ? (
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="sm">
            <Title order={4}>Hardware</Title>
            <ScrollArea>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Název</Table.Th>
                    <Table.Th>Popis</Table.Th>
                    <Table.Th ta="center">Množství</Table.Th>
                    <Table.Th ta="right">Cena/ks</Table.Th>
                    <Table.Th ta="right">Celkem</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invoice.hardware.map((item: any) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{item.itemName}</Table.Td>
                      <Table.Td>{item.description ?? '—'}</Table.Td>
                      <Table.Td ta="center">{item.quantity ?? 1}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(Number(item.unitPrice ?? 0))}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(Number(item.totalPrice ?? 0))}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Stack>
        </Card>
      ) : null}

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text c="dimmed">Celkový čas</Text>
            <Text fw={600}>{formatMinutes(summary.totalMinutes)}</Text>
          </Group>
          <Group justify="space-between">
            <Text c="dimmed">Kilometry</Text>
            <Text fw={600}>{summary.totalKm}</Text>
          </Group>
          <Group justify="space-between">
            <Text c="dimmed">Součet položek</Text>
            <Text fw={600}>{formatCurrency(summary.totalAmount)}</Text>
          </Group>
          <Group justify="space-between">
            <Text fw={600}>Celkem k úhradě</Text>
            <Text fw={700}>{formatCurrency(Number(invoice.totalAmount ?? 0) + Number(invoice.totalVat ?? 0))}</Text>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
