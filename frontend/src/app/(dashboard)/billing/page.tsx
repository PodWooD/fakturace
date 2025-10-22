'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
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
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput, MonthPickerInput } from '@mantine/dates';
import { NumberInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowDownRight,
  IconDeviceFloppy,
  IconDownload,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';

type ServiceItem = {
  id: number | null;
  serviceName: string;
  description: string | null;
  monthlyPrice: number;
  isActive?: boolean;
};

type WorkEntry = {
  id: number | null;
  date: string | null;
  worker: string;
  description: string;
  minutes: number;
  hours: number;
  kilometers: number;
  hourlyAmount: number;
  kmAmount: number;
  projectCode?: string;
  branch?: string;
  timeFrom?: string;
  timeTo?: string;
};

type InventoryItem = {
  id: number | null;
  itemName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status?: string;
  invoiceNumber?: string | null;
  supplier?: string | null;
  sourceInvoiceItemId?: number | null;
};

type BillingDraftData = {
  rates: {
    hourlyRate: string;
    kmRate: string;
    extraHourlyRate: string;
    extraKmRate: string;
  };
  services: ServiceItem[];
  work: {
    entries: WorkEntry[];
    notes: string;
  };
  hardware: InventoryItem[];
  software: InventoryItem[];
  totalsOverride?: {
    totalAmount?: number;
    totalVat?: number;
    totalWithVat?: number;
  } | null;
  notes?: string;
};

type BillingBaseResponse = {
  organization: {
    id: number;
    name: string;
    code?: string | null;
    hourlyRate: number | string;
    kmRate: number | string;
  };
  period: {
    month: number;
    year: number;
  };
  services: any[];
  work: {
    entries: any[];
    summary: any;
  };
  hardware: any[];
  software: any[];
  totals: any;
};

type BillingSummaryPayload = {
  base: BillingBaseResponse;
  draft: {
    data: Partial<BillingDraftData> | null;
    updatedAt: string;
    updatedBy: number | null;
  } | null;
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

const toNumber = (value: unknown, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const amountFrom = (value: any, cents?: any) => {
  if (value !== undefined && value !== null && value !== '') {
    return toNumber(value, 0);
  }
  if (typeof cents === 'number') {
    return cents / 100;
  }
  return 0;
};

const normalizeService = (service: any): ServiceItem => ({
  id: service?.id ?? null,
  serviceName: service?.serviceName ?? '',
  description: service?.description ?? '',
  monthlyPrice: amountFrom(service?.monthlyPrice, service?.monthlyPriceCents),
  isActive: service?.isActive !== false,
});

const normalizeWorkEntry = (entry: any): WorkEntry => {
  const minutes = toNumber(entry?.minutes, Math.round(toNumber(entry?.hours, 0) * 60));
  const hours = entry?.hours !== undefined ? toNumber(entry?.hours) : minutes / 60;
  return {
    id: entry?.id ?? null,
    date: entry?.date ?? null,
    worker: entry?.worker ?? '',
    description: entry?.description ?? '',
    minutes,
    hours,
    kilometers: toNumber(entry?.kilometers),
    hourlyAmount: amountFrom(entry?.hourlyAmount, entry?.hourlyAmountCents),
    kmAmount: amountFrom(entry?.kmAmount, entry?.kmAmountCents),
    projectCode: entry?.projectCode ?? '',
    branch: entry?.branch ?? '',
    timeFrom: entry?.timeFrom ?? '',
    timeTo: entry?.timeTo ?? '',
  };
};

const normalizeInventoryItem = (item: any): InventoryItem => ({
  id: item?.id ?? null,
  itemName: item?.itemName ?? '',
  description: item?.description ?? '',
  quantity: toNumber(item?.quantity, 1),
  unitPrice: amountFrom(item?.unitPrice, item?.unitPriceCents),
  totalPrice: amountFrom(item?.totalPrice, item?.totalPriceCents),
  status: item?.status,
  invoiceNumber: item?.invoiceNumber ?? item?.invoice?.invoiceNumber ?? null,
  supplier: item?.supplier ?? item?.invoice?.supplierName ?? null,
  sourceInvoiceItemId: item?.sourceInvoiceItemId ?? null,
});

const createEmptyService = (): ServiceItem => ({
  id: null,
  serviceName: '',
  description: '',
  monthlyPrice: 0,
  isActive: true,
});

const createEmptyWorkEntry = (): WorkEntry => ({
  id: null,
  date: null,
  worker: '',
  description: '',
  minutes: 0,
  hours: 0,
  kilometers: 0,
  hourlyAmount: 0,
  kmAmount: 0,
  projectCode: '',
  branch: '',
  timeFrom: '',
  timeTo: '',
});

const createEmptyInventoryItem = (type: 'hardware' | 'software'): InventoryItem => ({
  id: null,
  itemName: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
  status: type === 'hardware' ? 'MANUAL' : undefined,
  supplier: null,
  invoiceNumber: null,
  sourceInvoiceItemId: null,
});

const buildDraftFromBase = (base: BillingBaseResponse): BillingDraftData => ({
  rates: {
    hourlyRate: String(amountFrom(base.organization?.hourlyRate)),
    kmRate: String(amountFrom(base.organization?.kmRate)),
    extraHourlyRate: '',
    extraKmRate: '',
  },
  services: (base.services ?? []).map(normalizeService),
  work: {
    entries: (base.work?.entries ?? []).map(normalizeWorkEntry),
    notes: '',
  },
  hardware: (base.hardware ?? []).map(normalizeInventoryItem),
  software: (base.software ?? []).map(normalizeInventoryItem),
  totalsOverride: null,
  notes: '',
});

const normalizeDraftData = (
  draft: Partial<BillingDraftData> | null | undefined,
  base: BillingBaseResponse,
): BillingDraftData => {
  const defaults = buildDraftFromBase(base);
  if (!draft) {
    return defaults;
  }

  return {
    ...defaults,
    ...draft,
    rates: {
      hourlyRate: draft.rates?.hourlyRate ?? defaults.rates.hourlyRate,
      kmRate: draft.rates?.kmRate ?? defaults.rates.kmRate,
      extraHourlyRate: draft.rates?.extraHourlyRate ?? defaults.rates.extraHourlyRate,
      extraKmRate: draft.rates?.extraKmRate ?? defaults.rates.extraKmRate,
    },
    services: draft.services ? draft.services.map(normalizeService) : defaults.services,
    work: {
      entries: draft.work?.entries ? draft.work.entries.map(normalizeWorkEntry) : defaults.work.entries,
      notes: draft.work?.notes ?? defaults.work.notes,
    },
    hardware: draft.hardware ? draft.hardware.map(normalizeInventoryItem) : defaults.hardware,
    software: draft.software ? draft.software.map(normalizeInventoryItem) : defaults.software,
    totalsOverride: draft.totalsOverride ?? defaults.totalsOverride,
    notes: draft.notes ?? defaults.notes,
  };
};

const computeDraftTotals = (draft: BillingDraftData, baseTotals: BillingBaseResponse['totals']) => {
  const servicesAmount = draft.services.reduce((sum, service) => sum + toNumber(service.monthlyPrice), 0);
  const workHourly = draft.work.entries.reduce((sum, entry) => sum + toNumber(entry.hourlyAmount), 0);
  const workKm = draft.work.entries.reduce((sum, entry) => sum + toNumber(entry.kmAmount), 0);
  const hardwareAmount = draft.hardware.reduce((sum, item) => sum + toNumber(item.totalPrice), 0);
  const softwareAmount = draft.software.reduce((sum, item) => sum + toNumber(item.totalPrice), 0);

  const totalAmount = servicesAmount + workHourly + workKm + hardwareAmount + softwareAmount;
  const baseTotalAmount = amountFrom(baseTotals?.totalAmount, baseTotals?.totalAmountCents);
  const baseTotalVat = amountFrom(baseTotals?.totalVat, baseTotals?.totalVatCents);
  const vatRatio = baseTotalAmount > 0 ? baseTotalVat / baseTotalAmount : 0.21;
  const totalVat = totalAmount * vatRatio;

  return {
    servicesAmount,
    workAmount: workHourly,
    kmAmount: workKm,
    hardwareAmount: hardwareAmount + softwareAmount,
    totalAmount,
    totalVat,
    totalWithVat: totalAmount + totalVat,
  };
};

export default function BillingPage() {
  const { token, user } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const role = user?.role as UserRole;
  const canRead = hasPermission(role, 'billing:read');
  const canWrite = hasPermission(role, 'billing:write');
  const now = dayjs();
  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });
  const [selectedOrg, setSelectedOrg] = useState<string>('');
  const [baseData, setBaseData] = useState<BillingBaseResponse | null>(null);
  const [draftData, setDraftData] = useState<BillingDraftData | null>(null);
  const [draftMeta, setDraftMeta] = useState<{ updatedAt: string; updatedBy: number | null } | null>(null);
  const [availableHardware, setAvailableHardware] = useState<any[]>([]);
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [hardwareError, setHardwareError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const organizationsQuery = useQuery({
    queryKey: ['billing-organizations'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/organizations');
      return response.data.data.map((org: any) => ({ value: String(org.id), label: org.name })) as {
        value: string;
        label: string;
      }[];
    },
  });

  useEffect(() => {
    if (!selectedOrg && organizationsQuery.data?.length) {
      setSelectedOrg(organizationsQuery.data[0].value);
    }
  }, [organizationsQuery.data, selectedOrg]);

  useEffect(() => {
    setAvailableHardware([]);
    setHardwareError(null);
  }, [selectedOrg, period.month, period.year]);

  const summaryQuery = useQuery({
    enabled: Boolean(selectedOrg),
    queryKey: ['billing-summary', selectedOrg, period.year, period.month],
    queryFn: async () => {
      const res = await api.get<BillingSummaryPayload>('/billing/summary', {
        params: {
          organizationId: selectedOrg,
          month: period.month,
          year: period.year,
        },
      });
      return res.data;
    },
  });

  useEffect(() => {
    if (!summaryQuery.data) {
      return;
    }
    const payload = summaryQuery.data;
    setBaseData(payload.base);
    setDraftMeta(payload.draft ? { updatedAt: payload.draft.updatedAt, updatedBy: payload.draft.updatedBy } : null);
    setDraftData(normalizeDraftData(payload.draft?.data, payload.base));
    setIsDirty(false);
    setErrorMessage(null);
  }, [summaryQuery.data]);

  useEffect(() => {
    if (!summaryQuery.error) {
      return;
    }
    const error = summaryQuery.error as any;
    setErrorMessage(error?.response?.data?.error || 'Nepodařilo se načíst podklady pro fakturaci.');
    setBaseData(null);
    setDraftData(null);
  }, [summaryQuery.error]);

  const computedTotals = useMemo(() => {
    if (!draftData || !baseData) return null;
    return computeDraftTotals(draftData, baseData.totals);
  }, [draftData, baseData]);

  const markDirty = () => setIsDirty(true);

  const updateDraft = (updater: (prev: BillingDraftData) => BillingDraftData) => {
    setDraftData((prev) => {
      if (!prev || !canWrite) return prev;
      const updated = updater(prev);
      markDirty();
      return { ...updated };
    });
  };

  const handleRateChange = (field: keyof BillingDraftData['rates'], value: string) => {
    updateDraft((prev) => ({
      ...prev,
      rates: {
        ...prev.rates,
        [field]: value,
      },
    }));
  };

  const handleServiceChange = (index: number, field: keyof ServiceItem, value: string | number) => {
    updateDraft((prev) => {
      const services = [...prev.services];
      const updated = { ...services[index] };
      if (field === 'monthlyPrice') {
        updated.monthlyPrice = toNumber(value);
      } else if (field === 'serviceName' || field === 'description') {
        updated[field] = typeof value === 'string' ? value : '';
      }
      services[index] = updated;
      return { ...prev, services };
    });
  };

  const addServiceRow = () => {
    updateDraft((prev) => ({
      ...prev,
      services: [...prev.services, createEmptyService()],
    }));
  };

  const removeServiceRow = (index: number) => {
    updateDraft((prev) => ({
      ...prev,
      services: prev.services.filter((_, idx) => idx !== index),
    }));
  };

  const addWorkEntry = () => {
    updateDraft((prev) => ({
      ...prev,
      work: {
        ...prev.work,
        entries: [...prev.work.entries, createEmptyWorkEntry()],
      },
    }));
  };

  const removeWorkEntry = (index: number) => {
    updateDraft((prev) => ({
      ...prev,
      work: {
        ...prev.work,
        entries: prev.work.entries.filter((_, idx) => idx !== index),
      },
    }));
  };

  const handleWorkEntryField = (index: number, field: keyof WorkEntry, value: string | number | Date | null) => {
    updateDraft((prev) => {
      const entries = [...prev.work.entries];
      const entry = { ...entries[index] };

      if (field === 'date') {
        entry.date = value instanceof Date ? dayjs(value).format('YYYY-MM-DD') : (value as string) ?? null;
      } else if (['hours', 'kilometers', 'hourlyAmount', 'kmAmount'].includes(field)) {
        const numeric = toNumber(value);
        (entry as any)[field] = numeric;
        if (field === 'hours') {
          entry.minutes = Math.round(numeric * 60);
        }
      } else {
        (entry as any)[field] = (value as string) ?? '';
      }

      entries[index] = entry;
      return {
        ...prev,
        work: { ...prev.work, entries },
      };
    });
  };

  const addInventoryRow = (type: 'hardware' | 'software') => {
    updateDraft((prev) => ({
      ...prev,
      [type]: [...prev[type], createEmptyInventoryItem(type)],
    }));
  };

  const removeInventoryRow = (type: 'hardware' | 'software', index: number) => {
    updateDraft((prev) => ({
      ...prev,
      [type]: prev[type].filter((_, idx) => idx !== index),
    }));
  };

  const handleInventoryChange = (
    type: 'hardware' | 'software',
    index: number,
    field: keyof InventoryItem,
    value: string | number,
  ) => {
    updateDraft((prev) => {
      const list = [...prev[type]];
      const item = { ...list[index] };
      if (['quantity', 'unitPrice', 'totalPrice'].includes(field)) {
        const numeric = toNumber(value);
        (item as any)[field] = numeric;
        if (field === 'quantity' || field === 'unitPrice') {
          item.totalPrice = toNumber(item.quantity) * toNumber(item.unitPrice);
        }
      } else {
        (item as any)[field] = (value as string) ?? '';
      }
      list[index] = item;
      return {
        ...prev,
        [type]: list,
      };
    });
  };

  const fetchAvailableHardware = async () => {
    if (!selectedOrg) {
      setHardwareError('Vyberte organizaci.');
      return;
    }
    setHardwareLoading(true);
    setHardwareError(null);
    try {
      const response = await api.get('/hardware', {
        params: {
          organizationId: selectedOrg,
          status: 'ASSIGNED',
          month: period.month,
          year: period.year,
        },
      });
      setAvailableHardware(response.data.data ?? []);
    } catch (error: any) {
      setHardwareError(error?.response?.data?.error || 'Nepodařilo se načíst dostupný hardware.');
    } finally {
      setHardwareLoading(false);
    }
  };

  const handleAddHardwareFromPool = async (hardwareItem: any) => {
    if (!draftData) return;
    setHardwareError(null);
    try {
      updateDraft((prev) => ({
        ...prev,
        hardware: [
          ...prev.hardware,
          {
            id: hardwareItem?.id ?? null,
            itemName: hardwareItem?.itemName ?? '',
            description: hardwareItem?.description ?? '',
            quantity: toNumber(hardwareItem?.quantity, 1),
            unitPrice: amountFrom(hardwareItem?.unitPrice, hardwareItem?.unitPriceCents),
            totalPrice: amountFrom(hardwareItem?.totalPrice, hardwareItem?.totalPriceCents),
            status: 'INVOICED',
            invoiceNumber:
              hardwareItem?.invoiceItem?.invoice?.invoiceNumber ?? hardwareItem?.invoiceNumber ?? null,
            supplier:
              hardwareItem?.invoiceItem?.invoice?.supplierName ?? hardwareItem?.supplier ?? null,
            sourceInvoiceItemId: hardwareItem?.sourceInvoiceItemId ?? hardwareItem?.id ?? null,
          },
        ],
      }));

      await api.post(`/hardware/${hardwareItem.id}/status`, { status: 'INVOICED' });
      setAvailableHardware((prev) => prev.filter((item) => item.id !== hardwareItem.id));
    } catch (error: any) {
      setHardwareError(error?.response?.data?.error || 'Přiřazení položky selhalo.');
    }
  };

  const saveDraftMutation = useMutation({
    mutationFn: async (payload: BillingDraftData) => {
      const response = await api.put('/billing/draft', {
        organizationId: Number(selectedOrg),
        month: period.month,
        year: period.year,
        data: payload,
      });
      return response.data;
    },
    onSuccess: (data: any) => {
      notifications.show({
        title: 'Návrh uložen',
        message: 'Úpravy fakturace byly uloženy.',
        color: 'green',
      });
      if (data?.updatedAt) {
        setDraftMeta({ updatedAt: data.updatedAt, updatedBy: data.updatedBy ?? null });
      }
      setIsDirty(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Uložení návrhu selhalo.';
      notifications.show({ title: 'Chyba', message, color: 'red' });
    },
  });

  const selectedDate = dayjs().year(period.year).month(period.month - 1).date(1).toDate();

  if (!canRead) {
    return (
      <Alert color="red" title="Nedostatečná oprávnění" variant="light">
        Nemáte přístup k modulu Billing.
      </Alert>
    );
  }

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Title order={2}>Fakturace</Title>
          <Text c="dimmed" size="sm">
            Připravte detaily fakturace, upravte služby, nadlimitní práce i hardware.
          </Text>
          {draftMeta ? (
            <Text size="xs" c="dimmed">
              Poslední úprava: {dayjs(draftMeta.updatedAt).format('DD.MM.YYYY HH:mm')}
            </Text>
          ) : null}
        </Stack>
        <Group gap="sm">
          {isDirty ? (
            <Badge color="yellow" variant="light">
              Neuložené změny
            </Badge>
          ) : null}
          <Button
            variant="default"
            leftSection={<IconRefresh size={16} />}
            onClick={() => summaryQuery.refetch()}
            loading={summaryQuery.isRefetching}
          >
            Obnovit
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={() => {
              if (!canWrite || !draftData) {
                notifications.show({
                  title: 'Nedostatečná oprávnění',
                  message: 'Nemáte oprávnění ukládat návrh fakturace.',
                  color: 'red',
                });
                return;
              }
              saveDraftMutation.mutate(draftData);
            }}
            disabled={!draftData || !isDirty || !canWrite}
            loading={saveDraftMutation.isPending}
          >
            Uložit návrh
          </Button>
        </Group>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group grow align="flex-end">
            <Select
              label="Organizace"
              placeholder={organizationsQuery.isLoading ? 'Načítám...' : 'Vyberte organizaci'}
              data={organizationsQuery.data ?? []}
              value={selectedOrg || null}
              onChange={(value) => setSelectedOrg(value ?? '')}
              searchable
              nothingFoundMessage="Žádná organizace"
            />
            <MonthPickerInput
              label="Období"
              value={selectedDate}
              onChange={(value) => {
                if (!value) return;
                setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
              }}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Změna organizace nebo období načte data návrhu ze serveru a nahradí neuložené úpravy.
          </Text>
        </Stack>
      </Card>

      {errorMessage ? (
        <Alert color="red" variant="light">
          {errorMessage}
        </Alert>
      ) : null}

      {summaryQuery.isLoading ? (
        <Flex align="center" justify="center" mih={240}>
          <Loader color="blue" />
        </Flex>
      ) : draftData && baseData ? (
        <Stack gap="xl">
          {computedTotals ? (
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
              <Card withBorder radius="md" shadow="sm">
                <Stack gap={4} align="flex-start">
                  <Text size="sm" c="dimmed">
                    Paušální služby
                  </Text>
                  <Text fw={600}>{formatCurrency(computedTotals.servicesAmount)}</Text>
                </Stack>
              </Card>
              <Card withBorder radius="md" shadow="sm">
                <Stack gap={4} align="flex-start">
                  <Text size="sm" c="dimmed">
                    Práce techniků
                  </Text>
                  <Text fw={600}>{formatCurrency(computedTotals.workAmount)}</Text>
                </Stack>
              </Card>
              <Card withBorder radius="md" shadow="sm">
                <Stack gap={4} align="flex-start">
                  <Text size="sm" c="dimmed">
                    Kilometrovné
                  </Text>
                  <Text fw={600}>{formatCurrency(computedTotals.kmAmount)}</Text>
                </Stack>
              </Card>
              <Card withBorder radius="md" shadow="sm">
                <Stack gap={4} align="flex-start">
                  <Text size="sm" c="dimmed">
                    Celkem bez DPH
                  </Text>
                  <Text fw={700}>{formatCurrency(computedTotals.totalAmount)}</Text>
                  <Text size="xs" c="dimmed">
                    S DPH: {formatCurrency(computedTotals.totalWithVat)}
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
          ) : null}

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="md">
              <Title order={4}>Sazby</Title>
              <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
                <TextInput
                  label="Hodinová sazba (paušál)"
                  type="number"
                  value={draftData.rates.hourlyRate}
                  onChange={(event) => handleRateChange('hourlyRate', event.currentTarget.value)}
                />
                <TextInput
                  label="Sazba za kilometr (paušál)"
                  type="number"
                  value={draftData.rates.kmRate}
                  onChange={(event) => handleRateChange('kmRate', event.currentTarget.value)}
                />
                <TextInput
                  label="Hodinová sazba (nad rámec)"
                  type="number"
                  value={draftData.rates.extraHourlyRate}
                  onChange={(event) => handleRateChange('extraHourlyRate', event.currentTarget.value)}
                  placeholder="např. 750"
                />
                <TextInput
                  label="Sazba za km (nad rámec)"
                  type="number"
                  value={draftData.rates.extraKmRate}
                  onChange={(event) => handleRateChange('extraKmRate', event.currentTarget.value)}
                  placeholder="např. 12"
                />
              </SimpleGrid>
            </Stack>
          </Card>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>Paušální služby</Title>
                <Button leftSection={<IconPlus size={16} />} variant="light" onClick={addServiceRow}>
                  Přidat službu
                </Button>
              </Group>
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Název</Table.Th>
                      <Table.Th>Popis</Table.Th>
                      <Table.Th ta="right">Měsíční částka</Table.Th>
                      <Table.Th ta="center">Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {draftData.services.length ? (
                      draftData.services.map((service, index) => (
                        <Table.Tr key={`service-${index}`}>
                          <Table.Td>
                            <TextInput
                              value={service.serviceName}
                              onChange={(event) =>
                                handleServiceChange(index, 'serviceName', event.currentTarget.value)
                              }
                              placeholder="Název služby"
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={service.description ?? ''}
                              onChange={(event) =>
                                handleServiceChange(index, 'description', event.currentTarget.value)
                              }
                              placeholder="Popis"
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={160}>
                            <NumberInput
                              value={service.monthlyPrice}
                              thousandSeparator=" "
                              decimalSeparator=","
                              onChange={(value) => handleServiceChange(index, 'monthlyPrice', value ?? 0)}
                              clampBehavior="strict"
                              min={0}
                            />
                          </Table.Td>
                          <Table.Td ta="center" w={60}>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => removeServiceRow(index)}
                              aria-label="Odebrat"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={4} ta="center">
                          <Text c="dimmed">Žádné služby – přidejte novou položku.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>Práce techniků (nad rámec)</Title>
                <Button leftSection={<IconPlus size={16} />} variant="light" onClick={addWorkEntry}>
                  Přidat záznam
                </Button>
              </Group>
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Datum</Table.Th>
                      <Table.Th>Technik</Table.Th>
                      <Table.Th>Popis</Table.Th>
                      <Table.Th ta="right">Hodiny</Table.Th>
                      <Table.Th ta="right">Kilometry</Table.Th>
                      <Table.Th ta="right">Částka (hod)</Table.Th>
                      <Table.Th ta="right">Částka (km)</Table.Th>
                      <Table.Th ta="center">Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {draftData.work.entries.length ? (
                      draftData.work.entries.map((entry, index) => (
                        <Table.Tr key={`work-${index}`}>
                          <Table.Td w={150}>
                            <DateInput
                              value={entry.date ? dayjs(entry.date).toDate() : null}
                              onChange={(value) => handleWorkEntryField(index, 'date', value)}
                              valueFormat="DD.MM.YYYY"
                              placeholder="Datum"
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={entry.worker}
                              onChange={(event) => handleWorkEntryField(index, 'worker', event.currentTarget.value)}
                              placeholder="Pracovník"
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={entry.description}
                              onChange={(event) =>
                                handleWorkEntryField(index, 'description', event.currentTarget.value)
                              }
                              placeholder="Popis práce"
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={120}>
                            <NumberInput
                              value={entry.hours}
                              onChange={(value) => handleWorkEntryField(index, 'hours', value ?? 0)}
                              min={0}
                              step={0.25}
                              decimalSeparator=","
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={120}>
                            <NumberInput
                              value={entry.kilometers}
                              onChange={(value) => handleWorkEntryField(index, 'kilometers', value ?? 0)}
                              min={0}
                              step={1}
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={140}>
                            <NumberInput
                              value={entry.hourlyAmount}
                              onChange={(value) => handleWorkEntryField(index, 'hourlyAmount', value ?? 0)}
                              min={0}
                              decimalSeparator=","
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={140}>
                            <NumberInput
                              value={entry.kmAmount}
                              onChange={(value) => handleWorkEntryField(index, 'kmAmount', value ?? 0)}
                              min={0}
                              decimalSeparator=","
                            />
                          </Table.Td>
                          <Table.Td ta="center" w={60}>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => removeWorkEntry(index)}
                              aria-label="Odebrat"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={8} ta="center">
                          <Text c="dimmed">Žádné nadlimitní záznamy.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>Hardware</Title>
                <Group gap="sm">
                  <Button
                    variant="default"
                    leftSection={<IconDownload size={16} />}
                    onClick={fetchAvailableHardware}
                    loading={hardwareLoading}
                    disabled={!selectedOrg}
                  >
                    Načíst z faktur
                  </Button>
                  <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => addInventoryRow('hardware')}>
                    Přidat ručně
                  </Button>
                </Group>
              </Group>

              {hardwareError ? (
                <Alert color="red" variant="light">
                  {hardwareError}
                </Alert>
              ) : null}

              {availableHardware.length ? (
                <Card withBorder radius="md" padding="md" bg="blue.0">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Text fw={600} c="blue.8">
                        Položky připravené k přiřazení ({availableHardware.length})
                      </Text>
                      <Badge color="blue" size="sm">
                        Kliknutím přidáte do fakturace
                      </Badge>
                    </Group>
                    <ScrollArea>
                      <Table verticalSpacing="xs">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Položka</Table.Th>
                            <Table.Th>Dodavatel</Table.Th>
                            <Table.Th ta="right">Cena</Table.Th>
                            <Table.Th ta="center">Akce</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {availableHardware.map((item) => (
                            <Table.Tr key={item.id}>
                              <Table.Td>{item.itemName}</Table.Td>
                              <Table.Td>{item.invoiceItem?.invoice?.supplierName ?? item.supplier ?? '—'}</Table.Td>
                              <Table.Td ta="right">
                                {formatCurrency(amountFrom(item.totalPrice, item.totalPriceCents))}
                              </Table.Td>
                              <Table.Td ta="center">
                                <Button
                                  variant="subtle"
                                  size="xs"
                                  leftSection={<IconArrowDownRight size={14} />}
                                  onClick={() => handleAddHardwareFromPool(item)}
                                >
                                  Přidat
                                </Button>
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Stack>
                </Card>
              ) : null}

              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Název</Table.Th>
                      <Table.Th>Popis</Table.Th>
                      <Table.Th ta="right">Množství</Table.Th>
                      <Table.Th ta="right">Cena / ks</Table.Th>
                      <Table.Th ta="right">Celkem</Table.Th>
                      <Table.Th ta="center">Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {draftData.hardware.length ? (
                      draftData.hardware.map((item, index) => (
                        <Table.Tr key={`hardware-${index}`}>
                          <Table.Td>
                            <TextInput
                              value={item.itemName}
                              onChange={(event) =>
                                handleInventoryChange('hardware', index, 'itemName', event.currentTarget.value)
                              }
                              placeholder="Název položky"
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={item.description ?? ''}
                              onChange={(event) =>
                                handleInventoryChange('hardware', index, 'description', event.currentTarget.value)
                              }
                              placeholder="Popis"
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={120}>
                            <NumberInput
                              value={item.quantity}
                              onChange={(value) => handleInventoryChange('hardware', index, 'quantity', value ?? 0)}
                              min={0}
                              step={1}
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={140}>
                            <NumberInput
                              value={item.unitPrice}
                              onChange={(value) => handleInventoryChange('hardware', index, 'unitPrice', value ?? 0)}
                              decimalSeparator=","
                              min={0}
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={160}>
                            <NumberInput
                              value={item.totalPrice}
                              onChange={(value) => handleInventoryChange('hardware', index, 'totalPrice', value ?? 0)}
                              decimalSeparator=","
                              min={0}
                            />
                          </Table.Td>
                          <Table.Td ta="center" w={60}>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => removeInventoryRow('hardware', index)}
                              aria-label="Odebrat"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={6} ta="center">
                          <Text c="dimmed">Žádný hardware pro toto období.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>Software</Title>
                <Button leftSection={<IconPlus size={16} />} variant="light" onClick={() => addInventoryRow('software')}>
                  Přidat položku
                </Button>
              </Group>
              <ScrollArea>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Název</Table.Th>
                      <Table.Th>Popis</Table.Th>
                      <Table.Th ta="right">Množství</Table.Th>
                      <Table.Th ta="right">Cena / ks</Table.Th>
                      <Table.Th ta="right">Celkem</Table.Th>
                      <Table.Th ta="center">Akce</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {draftData.software.length ? (
                      draftData.software.map((item, index) => (
                        <Table.Tr key={`software-${index}`}>
                          <Table.Td>
                            <TextInput
                              value={item.itemName}
                              onChange={(event) =>
                                handleInventoryChange('software', index, 'itemName', event.currentTarget.value)
                              }
                              placeholder="Název"
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              value={item.description ?? ''}
                              onChange={(event) =>
                                handleInventoryChange('software', index, 'description', event.currentTarget.value)
                              }
                              placeholder="Popis"
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={120}>
                            <NumberInput
                              value={item.quantity}
                              onChange={(value) => handleInventoryChange('software', index, 'quantity', value ?? 0)}
                              min={0}
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={140}>
                            <NumberInput
                              value={item.unitPrice}
                              onChange={(value) => handleInventoryChange('software', index, 'unitPrice', value ?? 0)}
                              min={0}
                              decimalSeparator=","
                            />
                          </Table.Td>
                          <Table.Td ta="right" w={160}>
                            <NumberInput
                              value={item.totalPrice}
                              onChange={(value) => handleInventoryChange('software', index, 'totalPrice', value ?? 0)}
                              min={0}
                              decimalSeparator=","
                            />
                          </Table.Td>
                          <Table.Td ta="center" w={60}>
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              onClick={() => removeInventoryRow('software', index)}
                              aria-label="Odebrat"
                            >
                              <IconTrash size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      ))
                    ) : (
                      <Table.Tr>
                        <Table.Td colSpan={6} ta="center">
                          <Text c="dimmed">Žádný software pro toto období.</Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Stack>
          </Card>

          <Card withBorder radius="md" shadow="sm">
            <Stack gap="sm">
              <Title order={4}>Poznámky</Title>
              <Textarea
                minRows={4}
                value={draftData.notes ?? ''}
                onChange={(event) => {
                  const { value } = event.currentTarget;
                  updateDraft((prev) => ({
                    ...prev,
                    notes: value,
                  }));
                }}
                placeholder="Interní poznámky k fakturaci..."
              />
            </Stack>
          </Card>
        </Stack>
      ) : (
        <Card withBorder radius="md" shadow="sm">
          <Text c="dimmed">Vyberte organizaci a období.</Text>
        </Card>
      )}
    </Stack>
  );
}
