'use client';

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
import { notifications } from '@mantine/notifications';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { WorkRecordForm, WorkRecordFormValues } from '@/components/forms/WorkRecordForm';

type Option = { value: string; label: string };

const months = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: dayjs().month(index).format('MMMM'),
}));

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

const formatDate = (value: string | Date) => dayjs(value).format('DD.MM.YYYY');

export default function WorkRecordsPage() {
  const now = dayjs();
  const { token, user } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const queryClient = useQueryClient();
  const canWrite = hasPermission(user?.role as UserRole, 'workRecords:write');

  const [filters, setFilters] = useState({
    month: now.month() + 1,
    year: now.year(),
    organizationId: '',
    worker: '',
  });

  const [pagination, setPagination] = useState({ page: 1, limit: 25 });
  const [formOpened, setFormOpened] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);

  const organizationsQuery = useQuery<Option[]>({
    queryKey: ['work-records-organizations'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/organizations');
      return response.data.data.map((org: any) => ({ value: String(org.id), label: org.name })) as Option[];
    },
  });

  const recordsQuery = useQuery({
    queryKey: ['work-records', filters, pagination.page, pagination.limit],
    enabled: Boolean(token),
    queryFn: async () => {
      const params: Record<string, any> = {
        page: pagination.page,
        limit: pagination.limit,
        month: filters.month,
        year: filters.year,
      };
      if (filters.organizationId) params.organizationId = filters.organizationId;
      if (filters.worker) params.worker = filters.worker;
      const response = await api.get('/work-records', { params });
      return response.data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async ({ values, id }: { values: WorkRecordFormValues; id?: number }) => {
      const payload = {
        ...values,
        organizationId: Number(values.organizationId),
        billingOrgId: values.billingOrgId ? Number(values.billingOrgId) : undefined,
      };
      if (id) {
        await api.put(`/work-records/${id}`, payload);
      } else {
        await api.post('/work-records', payload);
      }
    },
    onSuccess: () => {
      notifications.show({ title: 'Hotovo', message: 'Záznam byl uložen', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['work-records'] });
      setFormOpened(false);
      setEditingRecord(null);
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Chyba',
        message: error?.response?.data?.error || 'Nepodařilo se uložit záznam',
        color: 'red',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/work-records/${id}`),
    onSuccess: () => {
      notifications.show({ title: 'Smazáno', message: 'Záznam byl odstraněn', color: 'green' });
      queryClient.invalidateQueries({ queryKey: ['work-records'] });
    },
    onError: () => {
      notifications.show({ title: 'Chyba', message: 'Smazání záznamu selhalo', color: 'red' });
    },
  });

  const records = recordsQuery.data?.data ?? [];
  const paginationInfo = recordsQuery.data?.pagination ?? {
    page: 1,
    pages: 1,
    limit: pagination.limit,
    total: 0,
  };

  const totals = records.reduce(
    (acc: any, record: any) => {
      acc.hours += record.hours || 0;
      acc.kilometers += record.kilometers || 0;
      acc.amount += record.totalAmount || 0;
      return acc;
    },
    { hours: 0, kilometers: 0, amount: 0 },
  );

  const handleEdit = (record: any) => {
    if (!canWrite) {
      notifications.show({
        title: 'Nedostatečná oprávnění',
        message: 'Nemáte oprávnění upravovat výkazy.',
        color: 'red',
      });
      return;
    }
    setEditingRecord({
      id: record.id,
      organizationId: String(record.organization?.id ?? ''),
      billingOrgId: record.billingOrg?.id ? String(record.billingOrg.id) : '',
      worker: record.worker ?? '',
      description: record.description ?? '',
      branch: record.branch ?? '',
      projectCode: record.projectCode ?? '',
      date: new Date(record.date),
      minutes: record.minutes ?? 0,
      kilometers: record.kilometers ?? 0,
      timeFrom: record.timeFrom ?? '',
      timeTo: record.timeTo ?? '',
    });
    setFormOpened(true);
  };

  const handleDelete = (record: any) => {
    if (!canWrite) {
      notifications.show({
        title: 'Nedostatečná oprávnění',
        message: 'Nemáte oprávnění mazat výkazy.',
        color: 'red',
      });
      return;
    }
    if (!window.confirm('Opravdu chcete smazat tento výkaz práce?')) return;
    deleteMutation.mutate(record.id);
  };

  const organizationsOptions: Option[] = organizationsQuery.data ?? [];

  const selectedMonthLabel = dayjs().month(filters.month - 1).format('MMMM');
  const selectedOrganizationLabel =
    filters.organizationId
      ? organizationsOptions.find((option: Option) => option.value === filters.organizationId)?.label ?? ''
      : '';
  const filtersSummary = `Měsíc: ${selectedMonthLabel} ${filters.year}`
    .concat(filters.organizationId ? ` • Organizace: ${selectedOrganizationLabel}` : '')
    .concat(filters.worker ? ` • Technik: ${filters.worker}` : '');

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Title order={2}>Výkazy práce</Title>
          <Text c="dimmed" size="sm">
            Správa odváděné práce techniků, filtrování a export podkladů pro fakturaci.
          </Text>
        </Stack>
        <Group gap="sm">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="default"
            onClick={() => recordsQuery.refetch()}
            loading={recordsQuery.isRefetching}
          >
            Obnovit
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditingRecord(null);
              setFormOpened(true);
            }}
            disabled={!canWrite}
          >
            Nový výkaz
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group grow>
            <Select
              label="Měsíc"
              data={months}
              value={String(filters.month)}
              onChange={(value) =>
                setFilters((prev) => {
                  const nextMonth = Number(value ?? prev.month);
                  setPagination((paginationPrev) => ({ ...paginationPrev, page: 1 }));
                  return { ...prev, month: nextMonth };
                })
              }
              searchable
            />
            <TextInput
              label="Rok"
              type="number"
              value={String(filters.year)}
              onChange={(event) =>
                setFilters((prev) => {
                  const parsed = Number(event.currentTarget.value || prev.year);
                  setPagination((paginationPrev) => ({ ...paginationPrev, page: 1 }));
                  return { ...prev, year: parsed };
                })
              }
            />
            <Select
              label="Organizace"
              placeholder="Všechny"
              data={organizationsOptions}
              searchable
              clearable
              value={filters.organizationId}
              onChange={(value) =>
                setFilters((prev) => {
                  setPagination((paginationPrev) => ({ ...paginationPrev, page: 1 }));
                  return { ...prev, organizationId: value ?? '' };
                })
              }
            />
            <TextInput
              label="Technik"
              placeholder="Filtrovat podle jména"
              value={filters.worker}
              onChange={(event) =>
                setFilters((prev) => {
                  setPagination((paginationPrev) => ({ ...paginationPrev, page: 1 }));
                  return { ...prev, worker: event.currentTarget.value };
                })
              }
            />
          </Group>
          <Text size="xs" c="dimmed">
            {filtersSummary}
          </Text>
        </Stack>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder radius="md" shadow="sm">
          <Stack gap={4} align="center">
            <Text size="sm" c="dimmed">
              Odpracované hodiny
            </Text>
            <Title order={3}>{totals.hours.toFixed(2)} h</Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="blue.0">
          <Stack gap={4} align="center">
            <Text size="sm" c="dimmed">
              Ujeté kilometry
            </Text>
            <Title order={3} c="blue.7">
              {totals.kilometers} km
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="green.0">
          <Stack gap={4} align="center">
            <Text size="sm" c="dimmed">
              Fakturace za výkazy
            </Text>
            <Title order={3} c="green.7">
              {formatCurrency(totals.amount)}
            </Title>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" shadow="sm">
        {recordsQuery.isLoading ? (
          <Flex align="center" justify="center" py="xl">
            <Loader color="blue" />
          </Flex>
        ) : records.length ? (
          <>
            <ScrollArea>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Datum</Table.Th>
                    <Table.Th>Technik</Table.Th>
                    <Table.Th>Organizace</Table.Th>
                    <Table.Th>Popis</Table.Th>
                    <Table.Th ta="center">Hodiny</Table.Th>
                    <Table.Th ta="center">Kilometry</Table.Th>
                    <Table.Th ta="right">Za práci</Table.Th>
                    <Table.Th ta="right">Za km</Table.Th>
                    <Table.Th ta="right">Celkem</Table.Th>
                    <Table.Th ta="center">Stav</Table.Th>
                    <Table.Th ta="right">Akce</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {records.map((record: any) => (
                    <Table.Tr key={record.id}>
                      <Table.Td>{formatDate(record.date)}</Table.Td>
                      <Table.Td>{record.worker}</Table.Td>
                      <Table.Td>{record.organization?.name ?? '—'}</Table.Td>
                      <Table.Td>{record.description}</Table.Td>
                      <Table.Td ta="center">{record.hours?.toFixed(2)}</Table.Td>
                      <Table.Td ta="center">{record.kilometers}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(record.hourlyAmount)}</Table.Td>
                      <Table.Td ta="right">{formatCurrency(record.kmAmount)}</Table.Td>
                      <Table.Td ta="right">
                        <Text fw={600}>{formatCurrency(record.totalAmount)}</Text>
                      </Table.Td>
                      <Table.Td ta="center">
                        <Badge color={record.status === 'APPROVED' ? 'green' : record.status === 'SUBMITTED' ? 'blue' : 'gray'}>
                          {record.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td ta="right">
                        {canWrite ? (
                          <Group gap="xs" justify="flex-end">
                            <ActionIcon
                              variant="light"
                              onClick={() => handleEdit(record)}
                              aria-label="Upravit"
                            >
                              <IconEdit size={16} />
                            </ActionIcon>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => handleDelete(record)}
                              loading={deleteMutation.isPending}
                              aria-label="Smazat"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Group>
                        ) : (
                          <Text size="xs" c="dimmed">
                            Jen ke čtení
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
            <Group justify="space-between" mt="md" align="center">
              <Text size="sm" c="dimmed">
                Stránka {paginationInfo.page} z {paginationInfo.pages} • Celkem {paginationInfo.total} záznamů
              </Text>
              <Pagination
                value={paginationInfo.page}
                onChange={(page) => setPagination((prev) => ({ ...prev, page }))}
                total={Math.max(paginationInfo.pages, 1)}
              />
            </Group>
          </>
        ) : (
          <Flex align="center" justify="center" py="xl">
            <Text c="dimmed">Pro zvolené období nejsou žádné výkazy práce.</Text>
          </Flex>
        )}
      </Card>

      <Modal
        opened={formOpened}
        onClose={() => {
          setFormOpened(false);
          setEditingRecord(null);
        }}
        title={editingRecord ? 'Upravit výkaz práce' : 'Nový výkaz práce'}
        size="lg"
        centered
      >
        <WorkRecordForm
          organizations={organizationsOptions}
          defaultValues={editingRecord ?? { date: new Date(), worker: '', minutes: 60, kilometers: 0, organizationId: '' }}
          onSubmit={(values) => upsertMutation.mutateAsync({ values, id: editingRecord?.id })}
          isSubmitting={upsertMutation.isPending}
        />
      </Modal>
    </Stack>
  );
}
