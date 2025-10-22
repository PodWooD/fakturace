'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
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
  Modal,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconDeviceFloppy,
  IconFileDescription,
  IconAlertTriangle,
  IconGitBranch,
  IconInfoCircle,
  IconRefresh,
  IconX,
  IconEye,
} from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';

const statusColor: Record<string, string> = {
  READY: 'green',
  PROCESSED: 'blue',
  ARCHIVED: 'gray',
  PENDING: 'yellow',
};

const formatCurrency = (value?: number | null, currency = 'CZK') =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency }).format(value ?? 0);

const isDiscountItem = (item: any) => {
  const combined = `${item?.itemName ?? ''} ${item?.description ?? ''}`.toLowerCase();
  const amount = Number(item?.totalPrice ?? item?.totalPriceCents ?? 0);
  return amount < 0 && combined.includes('sleva');
};

const extractDiscountIdentifier = (item: any) => {
  const sources = [item?.itemName ?? '', item?.description ?? ''];
  for (const source of sources) {
    const match = source.match(/k\s+položce\s+([A-Za-z0-9_-]+)/i);
    if (match) {
      return match[1];
    }
  }
  return null;
};

const extractSplitSuffix = (value?: string | null) => {
  if (!value) return null;
  const match = value.match(/\((\d+)\/(\d+)\)$/);
  return match ? `${match[1]}/${match[2]}` : null;
};

const formatDateTime = (value: string) => dayjs(value).format('DD.MM.YYYY HH:mm');

type OcrNotification = {
  id: number;
  type: string;
  level: string;
  message: string;
  metadata?: {
    invoiceId?: number;
    sourceLocation?: string;
    error?: string;
    filename?: string;
    attempts?: number;
    [key: string]: any;
  };
  createdAt: string;
  readAt?: string | null;
};

export default function ReceivedInvoicesPage() {
  const { token, user } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const queryClient = useQueryClient();
  const role = user?.role as UserRole;
  const canReprocess = hasPermission(role, 'receivedInvoices:ocr');
  const canApprove = hasPermission(role, 'receivedInvoices:approve');
  const canEditItems = canApprove;
  const canSplit = hasPermission(role, 'hardware:write');

  const invoicesQuery = useQuery({
    queryKey: ['received-invoices'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/received-invoices');
      return response.data;
    },
  });

  const notificationsQuery = useQuery<OcrNotification[]>({
    queryKey: ['notifications', 'ocr-failures'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/notifications', {
        params: { unread: true, type: 'OCR_FAILURE', limit: 50 },
      });
      return response.data;
    },
    refetchInterval: 60000,
  });

  const notificationsData = notificationsQuery.data ?? [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const invoices = invoicesQuery.data ?? [];
  const selectedInvoice = invoices.find((invoice: any) => invoice.id === selectedId) ?? null;

  const fetchDetail = useCallback(async (invoiceId: number | null) => {
    if (!invoiceId) {
      setItems([]);
      return;
    }
    setDetailLoading(true);
    setMessage(null);
    setError(null);
    try {
      const response = await api.get(`/received-invoices/${invoiceId}`);
      setItems(
        (response.data.items ?? []).map((item: any) => ({
          ...item,
          quantity: Number(item.quantity ?? 1),
          unitPrice: Number(item.unitPrice ?? 0),
          totalPrice: Number(item.totalPrice ?? 0),
          vatRate: Number(item.vatRate ?? 0),
        })),
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Nepodařilo se načíst položky faktury.');
    } finally {
      setDetailLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (selectedId === null && invoices.length > 0) {
      const first = invoices[0];
      setSelectedId(first.id);
      fetchDetail(first.id);
    }
  }, [fetchDetail, invoices, selectedId]);

  const handleSelect = async (id: number) => {
    setSelectedId(id);
    await fetchDetail(id);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      await api.put(`/received-invoices/${selectedId}/items`, {
        items: items.map((item) => ({
          id: item.id,
          itemName: item.itemName,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          vatRate: item.vatRate,
        })),
      });
    },
    onSuccess: () => {
      notifications.show({
        title: 'Položky uloženy',
        message: 'Úpravy faktury byly uloženy.',
        color: 'green',
      });
      setMessage('Položky byly úspěšně uloženy.');
      queryClient.invalidateQueries({ queryKey: ['received-invoices'] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Nepodařilo se uložit položky faktury.';
      notifications.show({ title: 'Chyba', message: msg, color: 'red' });
      setError(msg);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (action: 'approve' | 'reject') => {
      if (!selectedId) return;
      await api.post(`/received-invoices/${selectedId}/${action}`);
    },
    onSuccess: (_, action) => {
      notifications.show({
        title: action === 'approve' ? 'Faktura připravena' : 'Faktura archivována',
        message: action === 'approve' ? 'Faktura je označena jako READY.' : 'Faktura byla archivována.',
        color: action === 'approve' ? 'green' : 'orange',
      });
      queryClient.invalidateQueries({ queryKey: ['received-invoices'] });
      if (selectedId) fetchDetail(selectedId);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Operace selhala.';
      notifications.show({ title: 'Chyba', message: msg, color: 'red' });
    },
  });

  const splitMutation = useMutation<any, any, number>({
    mutationFn: async (itemId: number) => {
      return api.post('/hardware/split', { itemId });
    },
    onSuccess: async () => {
      notifications.show({
        title: 'Položka rozdělena',
        message: 'Položka byla rozdělena na jednotlivé kusy.',
        color: 'green',
      });
      await queryClient.invalidateQueries({ queryKey: ['received-invoices'] });
      if (selectedId) {
        await fetchDetail(selectedId);
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Rozdělení položky selhalo.';
      notifications.show({ title: 'Chyba', message: msg, color: 'red' });
    },
  });

  const markNotificationReadMutation = useMutation({
    mutationFn: async (notificationId: number) => {
      await api.post(`/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'ocr-failures'] });
    },
  });

  const markAllNotificationsMutation = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', 'ocr-failures'] });
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return null;
      const response = await api.post(`/received-invoices/${selectedId}/reprocess`);
      return response.data;
    },
    onSuccess: async (data) => {
      notifications.show({
        title: 'OCR dokončeno',
        message: 'Faktura byla znovu vytěžena a položky byly aktualizovány.',
        color: 'green',
      });
      setMessage('Faktura byla znovu vytěžena.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['received-invoices'] });
      if (selectedId) {
        await fetchDetail(selectedId);
      }
      if (data?.invoice?.items) {
        setItems(
          (data.invoice.items ?? []).map((item: any) => ({
            ...item,
            quantity: Number(item.quantity ?? 1),
            unitPrice: Number(item.unitPrice ?? 0),
            totalPrice: Number(item.totalPrice ?? 0),
            vatRate: Number(item.vatRate ?? 0),
          })),
        );
      }
    },
    onError: (err: any) => {
      const data = err?.response?.data;
      const msg = data?.error || 'Nepodařilo se znovu vytěžit fakturu.';
      const detail = data?.detail ? ` (${data.detail})` : '';
      notifications.show({ title: 'Chyba', message: msg, color: 'red' });
      setError(`${msg}${detail}`);
    },
  });

  const updateItem = (index: number, field: string, value: string | number) => {
    if (!canEditItems) {
      return;
    }
    setItems((prev) => {
      const clone = [...prev];
      clone[index] = { ...clone[index], [field]: value };
      if (field === 'quantity' || field === 'unitPrice') {
        const quantity = Number(clone[index].quantity ?? 0);
        const unitPrice = Number(clone[index].unitPrice ?? 0);
        clone[index].totalPrice = quantity * unitPrice;
      }
      return clone;
    });
  };

  const stats = useMemo(() => {
    if (!invoices.length) {
      return {
        total: 0,
        pending: 0,
        ready: 0,
        amount: 0,
      };
    }
    const total = invoices.length;
    const pending = invoices.filter((invoice: any) => invoice.status === 'PENDING').length;
    const ready = invoices.filter((invoice: any) => invoice.status === 'READY').length;
  const amount = invoices.reduce((sum: number, invoice: any) => sum + (invoice.totalWithVat ?? 0), 0);
  return { total, pending, ready, amount };
}, [invoices]);

const totalsCheck = useMemo(() => {
  const invoiceTotal = selectedInvoice?.totalWithVat ?? 0;
  const itemsTotal = items.reduce((sum, item) => sum + Number(item.totalPrice ?? 0), 0);
  const diff = itemsTotal - invoiceTotal;
  return {
    invoiceTotal,
    itemsTotal,
    diff,
    matches: Math.abs(diff) < 0.01,
  };
}, [items, selectedInvoice]);

const groupedItems = useMemo(() => {
  const groups: Array<{
    item: any;
    index: number;
    discounts: Array<{ item: any; index: number; pairing: 'identifier' | 'suffix' | 'order' }>;
    isDiscountOnly?: boolean;
  }> = [];
  const discountEntries: Array<{ item: any; index: number }> = [];

  items.forEach((item, index) => {
    if (isDiscountItem(item)) {
      discountEntries.push({ item, index });
    } else {
      groups.push({ item, index, discounts: [] });
    }
  });

  const findGroup = (predicate: (entry: (typeof groups)[number]) => boolean) =>
    groups.find(predicate);

  discountEntries.forEach((discount) => {
    const identifierRaw = discount.item.referenceProductCode || extractDiscountIdentifier(discount.item);
    const identifier = identifierRaw ? identifierRaw.toLowerCase() : null;
    let target: (typeof groups)[number] | undefined;
    let pairing: 'identifier' | 'suffix' | 'order' = 'order';

    if (identifier) {
      target = findGroup(
        (entry) =>
          (entry.item.productCode && entry.item.productCode.toLowerCase().includes(identifier)) ||
          (entry.item.referenceProductCode &&
            entry.item.referenceProductCode.toLowerCase().includes(identifier)) ||
          (entry.item.itemName && entry.item.itemName.toLowerCase().includes(identifier)) ||
          (entry.item.description && entry.item.description.toLowerCase().includes(identifier)),
      );
      if (target) {
        pairing = 'identifier';
      }
    }

    if (!target) {
      const suffix = extractSplitSuffix(discount.item.itemName);
      if (suffix) {
        target = findGroup((entry) => extractSplitSuffix(entry.item.itemName) === suffix);
        if (target) {
          pairing = 'suffix';
        }
      }
    }

    if (!target && groups.length) {
      target = groups[groups.length - 1];
      pairing = 'order';
    }

    if (target) {
      target.discounts.push({ ...discount, pairing });
    } else {
      groups.push({ item: discount.item, index: discount.index, discounts: [], isDiscountOnly: true });
    }
  });

  return groups;
}, [items]);

return (
  <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Title order={2}>Přijaté faktury</Title>
          <Text c="dimmed" size="sm">
            Kontrola importovaných faktur, úprava položek a schvalování k dalšímu zpracování.
          </Text>
        </Stack>
        <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => invoicesQuery.refetch()}>
          Obnovit
        </Button>
      </Group>

      {notificationsData.length ? (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Group gap="sm" align="center">
              <IconAlertTriangle size={18} color="var(--mantine-color-red-6)" />
              <Text fw={600} c="red.7">
                {notificationsData.length} OCR selhání čeká na řešení
              </Text>
            </Group>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              loading={markAllNotificationsMutation.isPending}
              onClick={() => markAllNotificationsMutation.mutate()}
            >
              Označit vše jako přečtené
            </Button>
          </Group>
          {notificationsData.map((notification) => (
            <Alert key={notification.id} color="red" icon={<IconAlertTriangle size={16} />} variant="light">
              <Stack gap={4}>
                <Text fw={600}>{notification.message}</Text>
                {notification.metadata?.error ? (
                  <Text size="sm">Chyba: {notification.metadata.error}</Text>
                ) : null}
                <Group gap="xs">
                  {notification.metadata?.filename ? (
                    <Badge color="red" variant="light">
                      {notification.metadata.filename}
                    </Badge>
                  ) : null}
                  {notification.metadata?.invoiceId ? (
                    <Badge color="red" variant="light">
                      Faktura #{notification.metadata.invoiceId}
                    </Badge>
                  ) : null}
                  {notification.metadata?.attempts ? (
                    <Badge color="red" variant="light">
                      Pokusy: {notification.metadata.attempts}
                    </Badge>
                  ) : null}
                </Group>
                <Group justify="space-between" align="center">
                  <Text size="xs" c="dimmed">
                    {formatDateTime(notification.createdAt)}
                    {notification.metadata?.sourceLocation
                      ? ` • ${notification.metadata.sourceLocation}`
                      : ''}
                  </Text>
                  <Button
                    size="xs"
                    variant="outline"
                    color="red"
                    loading={markNotificationReadMutation.isPending}
                    onClick={() => markNotificationReadMutation.mutate(notification.id)}
                  >
                    Označit jako přečtené
                  </Button>
                </Group>
              </Stack>
            </Alert>
          ))}
        </Stack>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 4 }}>
        <Card withBorder radius="md" shadow="sm">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Celkem faktur
            </Text>
            <Title order={3}>{stats.total}</Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="yellow.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Čeká na zpracování
            </Text>
            <Title order={3} c="yellow.7">
              {stats.pending}
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="green.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Připraveno
            </Text>
            <Title order={3} c="green.7">
              {stats.ready}
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="blue.0">
          <Stack align="center" gap={4}>
            <Text size="sm" c="dimmed">
              Celková částka
            </Text>
            <Title order={3} c="blue.7">
              {formatCurrency(stats.amount)}
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
            <SegmentedControl
              fullWidth
              value={selectedId ? String(selectedId) : ''}
              onChange={(value) => handleSelect(Number(value))}
              data={invoices.map((invoice: any) => ({
                value: String(invoice.id),
                label: `${invoice.supplierName} • ${invoice.invoiceNumber}${invoice.ocrStatus === 'FAILED' ? ' ⚠️' : ''}`,
              }))}
            />
          </ScrollArea>
        ) : (
          <Flex align="center" justify="center" py="xl">
            <Text c="dimmed">Žádné přijaté faktury zatím nejsou k dispozici.</Text>
          </Flex>
        )}
      </Card>

      {selectedInvoice && (
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Title order={4}>{selectedInvoice.supplierName}</Title>
                <Text size="sm" c="dimmed">
                  Číslo: {selectedInvoice.invoiceNumber} • Datum:{' '}
                  {selectedInvoice.issueDate
                    ? dayjs(selectedInvoice.issueDate).format('DD.MM.YYYY')
                    : 'neuvedeno'}
                </Text>
                <Group gap="xs">
                  <Badge color={statusColor[selectedInvoice.status] ?? 'gray'}>
                    {selectedInvoice.status}
                  </Badge>
                  <Badge variant="light">
                    {formatCurrency(selectedInvoice.totalWithVat, selectedInvoice.currency || 'CZK')}
                  </Badge>
                  {selectedInvoice.ocrStatus === 'FAILED' ? (
                    <Badge color="red" variant="light">OCR selhalo</Badge>
                  ) : null}
                </Group>
                <Text size="sm" c={totalsCheck.matches ? 'green.7' : 'red.7'}>
                  Kontrolní součet položek:{' '}
                  {formatCurrency(
                    totalsCheck.itemsTotal,
                    selectedInvoice.currency || 'CZK',
                  )}{' '}
                  {totalsCheck.matches
                    ? '(sedí)'
                    : `(${totalsCheck.diff > 0 ? '+' : ''}${formatCurrency(
                        totalsCheck.diff,
                        selectedInvoice.currency || 'CZK',
                      )} rozdíl)`}
                </Text>
              </Stack>
              <Group gap="sm">
                <Button
                  leftSection={<IconEye size={16} />}
                  variant="outline"
                  disabled={!selectedInvoice.sourceFilePath}
                  loading={previewLoading}
                  onClick={async () => {
                    if (!selectedInvoice.sourceFilePath) {
                      notifications.show({
                        title: 'Soubor není k dispozici',
                        message: 'Pro tuto fakturu není uložen originální soubor.',
                        color: 'yellow',
                      });
                      return;
                    }
                    if (!token) {
                      notifications.show({
                        title: 'Chybí přihlášení',
                        message: 'Pro stažení originálu je nutné být přihlášen.',
                        color: 'red',
                      });
                      return;
                    }

                    setPreviewLoading(true);
                    try {
                      const response = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/received-invoices/${selectedInvoice.id}/file`,
                        {
                          headers: {
                            Authorization: `Bearer ${token}`,
                          },
                        },
                      );

                      if (!response.ok) {
                        const text = await response.text().catch(() => 'Nepodařilo se stáhnout soubor.');
                        throw new Error(text || response.statusText);
                      }

                      const blob = await response.blob();
                      const blobUrl = URL.createObjectURL(blob);
                      const disposition = response.headers.get('Content-Disposition') || '';
                      const match = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
                      const encodedName = match?.[1] || match?.[2];
                      const decodedName = encodedName
                        ? decodeURIComponent(encodedName)
                        : `${selectedInvoice.invoiceNumber || `received-invoice-${selectedInvoice.id}`}.pdf`;

                      const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');

                      if (!newWindow) {
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = decodedName;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(blobUrl);
                      } else {
                        newWindow.document.title = decodedName;
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                      }
                    } catch (previewError: any) {
                      notifications.show({
                        title: 'Náhled selhal',
                        message:
                          typeof previewError?.message === 'string' && previewError.message.trim() !== ''
                            ? previewError.message
                            : 'Nepodařilo se načíst originální soubor faktury.',
                        color: 'red',
                      });
                    } finally {
                      setPreviewLoading(false);
                    }
                  }}
                >
                  Náhled faktury
                </Button>
                <Button
                  leftSection={<IconRefresh size={16} />}
                  variant="outline"
                  onClick={() => {
                    if (!canReprocess) {
                      notifications.show({
                        title: 'Nedostatečná oprávnění',
                        message: 'Nemáte oprávnění znovu spustit OCR.',
                        color: 'red',
                      });
                      return;
                    }
                    if (!selectedId || !selectedInvoice.sourceFilePath) {
                      notifications.show({
                        title: 'Nelze spustit OCR',
                        message: 'Pro tuto fakturu není k dispozici originální soubor.',
                        color: 'yellow',
                      });
                      return;
                    }
                    if (window.confirm('Původní položky budou nahrazeny novým výsledkem OCR. Pokračovat?')) {
                      reprocessMutation.mutate();
                    }
                  }}
                  loading={reprocessMutation.isPending}
                  disabled={!selectedInvoice.sourceFilePath}
                >
                  Znovu vytěžit OCR
                </Button>
                <Button
                  leftSection={<IconCheck size={16} />}
                  color="green"
                  variant="light"
                  onClick={() => {
                    if (!canApprove) {
                      notifications.show({
                        title: 'Nedostatečná oprávnění',
                        message: 'Nemáte oprávnění schvalovat fakturu.',
                        color: 'red',
                      });
                      return;
                    }
                    statusMutation.mutate('approve');
                  }}
                  loading={statusMutation.isPending}
                  disabled={!canApprove}
                >
                  Schválit
                </Button>
                <Button
                  leftSection={<IconX size={16} />}
                  color="red"
                  variant="light"
                  onClick={() => {
                    if (!canApprove) {
                      notifications.show({
                        title: 'Nedostatečná oprávnění',
                        message: 'Nemáte oprávnění archivovat fakturu.',
                        color: 'red',
                      });
                      return;
                    }
                    statusMutation.mutate('reject');
                  }}
                  loading={statusMutation.isPending}
                  disabled={!canApprove}
                >
                  Archivovat
                </Button>
              </Group>
            </Group>

            {(message || error) && (
              <Alert
                icon={<IconInfoCircle size={16} />}
                color={message ? 'green' : 'red'}
                variant="light"
              >
                {message || error}
              </Alert>
            )}

            {selectedInvoice.ocrStatus === 'FAILED' && selectedInvoice.ocrError ? (
              <Alert icon={<IconInfoCircle size={16} />} color="red" variant="filled">
                OCR chyba: {selectedInvoice.ocrError}
              </Alert>
            ) : null}

            {detailLoading ? (
              <Flex align="center" justify="center" py="xl">
                <Loader color="blue" />
              </Flex>
            ) : (
              <Stack gap="sm">
                <ScrollArea>
                  <Table highlightOnHover verticalSpacing="sm" withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Položka</Table.Th>
                        <Table.Th>Popis</Table.Th>
                        <Table.Th ta="center">Množství</Table.Th>
                        <Table.Th ta="right">Cena/ks</Table.Th>
                        <Table.Th ta="right">Celkem</Table.Th>
                        <Table.Th ta="center">DPH</Table.Th>
                        <Table.Th ta="center">Stav</Table.Th>
                        <Table.Th ta="center">Akce</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {groupedItems.map((entry) => {
                        if (entry.isDiscountOnly) {
                          const discountItem = entry.item;
                          const currency = selectedInvoice.currency || 'CZK';
                          return (
                            <Table.Tr key={`discount-only-${discountItem.id}`}>
                              <Table.Td>
                                <Stack gap={2}>
                                  <Text fw={500} c="red.7">
                                    {discountItem.itemName}
                                  </Text>
                                  <Text size="xs" c="dimmed">
                                    {selectedInvoice.invoiceNumber}
                                  </Text>
                                </Stack>
                              </Table.Td>
                              <Table.Td>
                                <Text size="sm" c="dimmed">
                                  {discountItem.description ?? '—'}
                                </Text>
                              </Table.Td>
                              <Table.Td ta="center">1</Table.Td>
                              <Table.Td ta="right">
                                {formatCurrency(
                                  Number(discountItem.unitPrice ?? discountItem.totalPrice ?? 0),
                                  currency,
                                )}
                              </Table.Td>
                              <Table.Td ta="right">
                                {formatCurrency(Number(discountItem.totalPrice ?? 0), currency)}
                              </Table.Td>
                              <Table.Td ta="center">{discountItem.vatRate ?? 0}%</Table.Td>
                              <Table.Td ta="center">
                                <Badge color="red" variant="light">
                                  Sleva
                                </Badge>
                              </Table.Td>
                              <Table.Td ta="center">
                                <Text size="xs" c="dimmed">
                                  Sleva bez přiřazení
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          );
                        }

                        const { item, index, discounts } = entry;
                        const itemQuantity = Number(item.quantity ?? 0);
                        const canSplitItem =
                          canSplit && item.status !== 'ASSIGNED' && itemQuantity > 1;
                        const isSplitting =
                          splitMutation.isPending && splitMutation.variables === item.id;
                        const currency = selectedInvoice.currency || 'CZK';

                        return (
                          <Fragment key={item.id}>
                            <Table.Tr>
                              <Table.Td>
                                <TextInput
                                  value={item.itemName ?? ''}
                                  onChange={(event) => updateItem(index, 'itemName', event.currentTarget.value)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td>
                                <TextInput
                                  value={item.description ?? ''}
                                  onChange={(event) => updateItem(index, 'description', event.currentTarget.value)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td ta="center">
                                <NumberInput
                                  value={item.quantity ?? 0}
                                  min={0}
                                  onChange={(value) => updateItem(index, 'quantity', Number(value) || 0)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td ta="right">
                                <NumberInput
                                  value={item.unitPrice ?? 0}
                                  min={0}
                                  step={0.1}
                                  onChange={(value) => updateItem(index, 'unitPrice', Number(value) || 0)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td ta="right">
                                <NumberInput
                                  value={item.totalPrice ?? 0}
                                  min={0}
                                  step={0.1}
                                  onChange={(value) => updateItem(index, 'totalPrice', Number(value) || 0)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td ta="center">
                                <NumberInput
                                  value={item.vatRate ?? 0}
                                  min={0}
                                  step={1}
                                  onChange={(value) => updateItem(index, 'vatRate', Number(value) || 0)}
                                  disabled={!canEditItems}
                                />
                              </Table.Td>
                              <Table.Td ta="center">
                                <Badge>{item.status}</Badge>
                              </Table.Td>
                              <Table.Td ta="center">
                                {canSplitItem ? (
                                  <Button
                                    size="xs"
                                    variant="light"
                                    leftSection={<IconGitBranch size={14} />}
                                    loading={isSplitting}
                                    onClick={() => {
                                      if (window.confirm('Rozdělit položku na jednotlivé kusy? Tento krok nelze vrátit.')) {
                                        splitMutation.mutate(item.id);
                                      }
                                    }}
                                  >
                                    Rozdělit
                                  </Button>
                                ) : (
                                  <Text size="xs" c="dimmed">
                                    —
                                  </Text>
                                )}
                              </Table.Td>
                            </Table.Tr>
                            {discounts.map((discountEntry) => {
                              const discountItem = discountEntry.item;
                              return (
                                <Table.Tr key={`discount-${discountItem.id}`}>
                                  <Table.Td>
                                    <Text fw={500} c="red.7">
                                      {discountItem.itemName}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm" c="dimmed">
                                      {discountItem.description ?? '—'}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td ta="center">1</Table.Td>
                                  <Table.Td ta="right">
                                    {formatCurrency(
                                      Number(discountItem.unitPrice ?? discountItem.totalPrice ?? 0),
                                      currency,
                                    )}
                                  </Table.Td>
                                  <Table.Td ta="right">
                                    {formatCurrency(Number(discountItem.totalPrice ?? 0), currency)}
                                  </Table.Td>
                                  <Table.Td ta="center">{discountItem.vatRate ?? 0}%</Table.Td>
                                  <Table.Td ta="center">
                                    <Badge color="red" variant="light">
                                      Sleva
                                    </Badge>
                                  </Table.Td>
                                  <Table.Td ta="center">
                                    <Text size="xs" c="dimmed">
                                      {discountEntry.pairing === 'identifier'
                                        ? 'Přiřazeno dle identifikátoru'
                                        : discountEntry.pairing === 'suffix'
                                        ? 'Přiřazeno dle pořadí řádků'
                                        : 'Přiřazeno k předchozí položce'}
                                    </Text>
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
                <Group justify="flex-end">
                  <Button
                    leftSection={<IconDeviceFloppy size={16} />}
                    onClick={() => {
                      if (!canEditItems) {
                        notifications.show({
                          title: 'Nedostatečná oprávnění',
                          message: 'Nemáte oprávnění upravovat položky.',
                          color: 'red',
                        });
                        return;
                      }
                      saveMutation.mutate();
                    }}
                    loading={saveMutation.isPending}
                    disabled={!canEditItems}
                  >
                    Uložit položky
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Card>
      )}

      {!selectedInvoice && invoices.length > 0 && (
        <Alert icon={<IconFileDescription size={16} />} color="yellow" variant="light">
          Vyberte fakturu ze seznamu výše pro zobrazení detailu a položek.
        </Alert>
      )}
    </Stack>
  );
}
