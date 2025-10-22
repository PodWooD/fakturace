'use client';

import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconDeviceFloppy, IconEye } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}:${rest.toString().padStart(2, '0')}`;
};

const formatDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '—');

export default function NewInvoicePage() {
  const now = dayjs();
  const router = useRouter();
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const [form, setForm] = useState({
    organizationId: '',
    month: now.month() + 1,
    year: now.year(),
  });

  const organizationsQuery = useQuery({
    queryKey: ['invoice-organizations'],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await api.get('/organizations');
      return res.data.data.map((org: any) => ({ value: String(org.id), label: org.name }));
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/invoices/preview', {
        organizationId: Number(form.organizationId),
        month: form.month,
        year: form.year,
      });
      return response.data;
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () =>
      api.post('/invoices/generate', {
        organizationId: Number(form.organizationId),
        month: form.month,
        year: form.year,
      }),
    onSuccess: (response) => {
      notifications.show({
        title: 'Faktura vytvořena',
        message: 'Faktura byla úspěšně vygenerována.',
        color: 'green',
      });
      if (response?.data?.id) {
        router.push(`/invoices/${response.data.id}`);
      }
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Chyba',
        message: error?.response?.data?.error || 'Nepodařilo se vytvořit fakturu.',
        color: 'red',
      });
    },
  });

  const preview = previewMutation.data;

  const summary = useMemo(() => {
    if (!preview) {
      return {
        workAmount: 0,
        servicesAmount: 0,
        hardwareAmount: 0,
        totalAmount: 0,
        totalVat: 0,
        totalWithVat: 0,
      };
    }
    return preview.summary ?? {
      workAmount: 0,
      servicesAmount: 0,
      hardwareAmount: 0,
      totalAmount: 0,
      totalVat: 0,
      totalWithVat: 0,
    };
  }, [preview]);

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Group gap="sm">
          <Button component={Link} href="/invoices" variant="default" leftSection={<IconArrowLeft size={16} />}>
            Zpět na faktury
          </Button>
          <Title order={2}>Pokročilé vytvoření faktury</Title>
        </Group>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          disabled={!preview}
          loading={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          Vytvořit fakturu
        </Button>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Group grow>
            <Select
              label="Organizace"
              placeholder="Vyberte organizaci"
              data={organizationsQuery.data || []}
              value={form.organizationId}
              onChange={(value) => setForm((prev) => ({ ...prev, organizationId: value ?? '' }))}
              searchable
              nothingFoundMessage="Žádná organizace"
              error={!form.organizationId ? 'Vyberte organizaci' : undefined}
            />
            <MonthPickerInput
              label="Období"
              value={dayjs().year(form.year).month(form.month - 1).toDate()}
              onChange={(value) => {
                if (!value) return;
                setForm((prev) => ({ ...prev, month: dayjs(value).month() + 1, year: dayjs(value).year() }));
              }}
            />
          </Group>
          <Group justify="space-between">
            <Button
              variant="light"
              leftSection={<IconEye size={16} />}
              disabled={!form.organizationId}
              loading={previewMutation.isPending}
              onClick={() => previewMutation.mutate()}
            >
              Zobrazit náhled
            </Button>
            <Badge color={preview ? 'green' : 'gray'}>{preview ? 'Náhled připraven' : 'Není načten'}</Badge>
          </Group>
        </Stack>
      </Card>

      {previewMutation.isPending && (
        <Flex align="center" justify="center" mih={200}>
          <Loader color="blue" />
        </Flex>
      )}

      {preview && (
        <Stack gap="xl">
          <Card withBorder radius="md" shadow="sm">
            <Stack gap="sm">
              <Title order={4}>Souhrn</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
              <Card padding="md" withBorder radius="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      Celkem bez DPH
                    </Text>
                    <Text fw={600}>{formatCurrency(Number(summary.totalAmount ?? 0))}</Text>
                  </Stack>
                </Card>
                <Card padding="md" withBorder radius="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      DPH
                    </Text>
                    <Text fw={600}>{formatCurrency(Number(summary.totalVat ?? 0))}</Text>
                  </Stack>
                </Card>
                <Card padding="md" withBorder radius="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      Celkem s DPH
                    </Text>
                    <Text fw={700}>{formatCurrency(Number(summary.totalWithVat ?? 0))}</Text>
                  </Stack>
                </Card>
              </SimpleGrid>
            </Stack>
          </Card>

          {preview.workRecords?.length ? (
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
                      {preview.workRecords.map((record: any) => (
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

          {preview.services?.length ? (
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
                    {preview.services.map((service: any) => (
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

          {preview.hardware?.length ? (
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
                      {preview.hardware.map((item: any) => (
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
        </Stack>
      )}
    </Stack>
  );
}
