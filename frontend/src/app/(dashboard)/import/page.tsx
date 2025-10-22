'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { FileInput } from '@mantine/core';
import { MonthPickerInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconUpload } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

type QueueItem = {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  message?: string;
  fileLocation?: string;
};

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const uploadWithProgress = (
  url: string,
  token: string,
  formData: FormData,
  onProgress: (progress: number) => void,
) =>
  new Promise<any>((resolve, reject) => {
    console.log('[Upload] Starting upload to:', url);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'json';

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const progress = Math.round((evt.loaded / evt.total) * 100);
        console.log('[Upload] Progress:', progress + '%');
        onProgress(progress);
      }
    };

    xhr.onerror = (err) => {
      console.error('[Upload] XHR Error:', err);
      reject(new Error('Chyba při odesílání souboru'));
    };

    xhr.onload = () => {
      console.log('[Upload] Response status:', xhr.status);
      console.log('[Upload] Response:', xhr.response);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
      } else {
        const error = xhr.response?.error || xhr.statusText || 'Chyba serveru';
        console.error('[Upload] Server error:', error);
        reject(new Error(error));
      }
    };

    console.log('[Upload] Sending request...');
    xhr.send(formData);
  });

export default function ImportPage() {
  const now = dayjs();
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);

  const [period, setPeriod] = useState({ month: now.month() + 1, year: now.year() });
  const [excelQueue, setExcelQueue] = useState<QueueItem[]>([]);
  const [invoiceQueue, setInvoiceQueue] = useState<QueueItem[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [excelUploading, setExcelUploading] = useState(false);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const queueSetter = (type: 'excel' | 'invoice') =>
    type === 'excel' ? setExcelQueue : setInvoiceQueue;

  const addFiles = (type: 'excel' | 'invoice', value: File[] | File | null) => {
    if (!value) return;
    const files = Array.isArray(value) ? value : [value];
    if (!files.length) return;
    const append = files.map((file) => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    queueSetter(type)((prev) => [...prev, ...append]);
  };

  const removeFile = (type: 'excel' | 'invoice', id: string) => {
    queueSetter(type)((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQueueItem = (
    type: 'excel' | 'invoice',
    id: string,
    data: Partial<QueueItem>,
  ) => {
    queueSetter(type)((prev) => prev.map((item) => (item.id === id ? { ...item, ...data } : item)));
  };

  const resetQueue = (type: 'excel' | 'invoice') => queueSetter(type)([]);

  const handleExcelUpload = async () => {
    if (!token) return;
    if (!excelQueue.length) {
      setExcelError('Přidejte alespoň jeden Excel soubor.');
      return;
    }
    setExcelError(null);
    setExcelUploading(true);
    let hasError = false;
    let hasSuccess = false;
    try {
      for (const item of excelQueue) {
        if (item.status === 'success') continue;
        updateQueueItem('excel', item.id, { status: 'uploading', progress: 0, message: undefined });

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('month', String(period.month));
        formData.append('year', String(period.year));

        try {
          const response = await uploadWithProgress(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/import/excel`,
            token,
            formData,
            (progress) => updateQueueItem('excel', item.id, { progress }),
          );
          const imported =
            response?.recordsCount ??
            response?.data?.recordsCount ??
            response?.imported ??
            null;
          const baseMessage = imported
            ? `Importováno ${imported} záznamů.`
            : 'Import dokončen.';
          const message = response?.fileLocation
            ? `${baseMessage} Soubor archivován v úložišti.`
            : baseMessage;
          updateQueueItem('excel', item.id, {
            status: 'success',
            progress: 100,
            message,
            fileLocation: response?.fileLocation,
          });
          hasSuccess = true;
        } catch (error: any) {
          updateQueueItem('excel', item.id, {
            status: 'error',
            message: error.message || 'Import selhal.',
          });
          hasError = true;
        }
      }
      if (hasSuccess && !hasError) {
        notifications.show({
          title: 'Hotovo',
          message: 'Import výkazů byl dokončen.',
          color: 'green',
        });
      } else if (hasSuccess && hasError) {
        setExcelError('Některé soubory se nepodařilo importovat. Zkontrolujte označené položky.');
        notifications.show({
          title: 'Částečný import',
          message: 'Import proběhl, ale některé soubory selhaly.',
          color: 'yellow',
        });
      } else if (hasError) {
        setExcelError('Import se nezdařil. Zkuste to prosím znovu.');
        notifications.show({
          title: 'Import selhal',
          message: 'Ani jeden soubor se nepodařilo importovat.',
          color: 'red',
        });
      }
    } finally {
      setExcelUploading(false);
    }
  };

  const handleInvoiceUpload = async () => {
    if (!token) return;
    if (!invoiceQueue.length) {
      setInvoiceError('Přidejte alespoň jeden soubor (PDF nebo ISDOC).');
      return;
    }
    setInvoiceError(null);
    setInvoiceUploading(true);
    let hasError = false;
    let hasSuccess = false;
    try {
      for (const item of invoiceQueue) {
        if (item.status === 'success') continue;
        updateQueueItem('invoice', item.id, { status: 'uploading', progress: 0, message: undefined });

        const formData = new FormData();
        formData.append('file', item.file);

        try {
          const response = await uploadWithProgress(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/received-invoices/upload`,
            token,
            formData,
            (progress) => updateQueueItem('invoice', item.id, { progress }),
          );
          const items = response?.items?.length ?? 0;
          updateQueueItem('invoice', item.id, {
            status: 'success',
            progress: 100,
            message: items ? `Rozpoznáno ${items} položek.` : 'Faktura nahrána.',
          });
          hasSuccess = true;
        } catch (error: any) {
          updateQueueItem('invoice', item.id, {
            status: 'error',
            message: error.message || 'Nahrávání selhalo.',
          });
          hasError = true;
        }
      }
      if (hasSuccess && !hasError) {
        notifications.show({
          title: 'Hotovo',
          message: 'Faktury byly odeslány na zpracování.',
          color: 'green',
        });
      } else if (hasSuccess && hasError) {
        setInvoiceError('Některé faktury se nepodařilo nahrát. Zkontrolujte označené položky.');
        notifications.show({
          title: 'Částečný import',
          message: 'Zpracování proběhlo, ale některé faktury byly odmítnuty.',
          color: 'yellow',
        });
      } else if (hasError) {
        setInvoiceError('Nahrávání se nezdařilo. Zkuste to prosím znovu.');
        notifications.show({
          title: 'Nahrávání selhalo',
          message: 'Ani jedna faktura se nepodařila odeslat.',
          color: 'red',
        });
      }
    } finally {
      setInvoiceUploading(false);
    }
  };

  const downloadTemplate = async () => {
    if (!token) return;
    setTemplateLoading(true);
    try {
      const response = await api.get('/import/template', { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fakturace-import-${period.year}-${period.month}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      notifications.show({ title: 'Chyba', message: 'Nepodařilo se stáhnout šablonu.', color: 'red' });
    } finally {
      setTemplateLoading(false);
    }
  };

  const renderQueue = (queue: QueueItem[], type: 'excel' | 'invoice') => {
    if (!queue.length) {
      return (
        <Alert color="blue" variant="light">
          {type === 'excel'
            ? 'Přidejte Excel soubory pro import. Každý soubor odpovídá jednomu měsíci.'
            : 'Přidejte PDF nebo ISDOC faktury – po nahrání je schválíte v sekci Přijaté faktury.'}
        </Alert>
      );
    }

    return (
      <Stack gap="sm">
        {queue.map((item) => (
          <Card key={item.id} withBorder radius="md" shadow="sm">
            <Stack gap={4}>
              <Group justify="space-between">
                <Text fw={500}>{item.file.name}</Text>
                <Text size="xs" c="dimmed">
                  {formatFileSize(item.file.size)}
                </Text>
              </Group>
              <Progress
                value={item.progress}
                color={item.status === 'error' ? 'red' : item.status === 'success' ? 'green' : 'blue'}
              />
              {item.message ? (
                <Alert color={item.status === 'error' ? 'red' : 'green'} variant="light">
                  {item.message}
                </Alert>
              ) : null}
              {item.fileLocation ? (
                <Text size="xs" c="dimmed">
                  Uloženo jako: {item.fileLocation}
                </Text>
              ) : null}
              <Group justify="space-between">
                <Badge color={item.status === 'success' ? 'green' : item.status === 'error' ? 'red' : 'blue'}>
                  {item.status === 'pending' && 'Čeká'}
                  {item.status === 'uploading' && 'Nahrávám'}
                  {item.status === 'success' && 'Hotovo'}
                  {item.status === 'error' && 'Chyba'}
                </Badge>
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => removeFile(type, item.id)}
                  disabled={item.status === 'uploading'}
                >
                  Odebrat
                </Button>
              </Group>
            </Stack>
          </Card>
        ))}
      </Stack>
    );
  };

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <Title order={2}>Import výkazů a faktur</Title>
        <Text c="dimmed" size="sm">
          Nahrajte Excel se záznamy práce nebo PDF/ISDOC faktury – systém je postupně zpracuje a připraví pro kontrolu.
        </Text>
      </Stack>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Group grow>
            <MonthPickerInput
              label="Období importu"
              value={dayjs().year(period.year).month(period.month - 1).toDate()}
              onChange={(value) => {
                if (!value) return;
                setPeriod({ month: dayjs(value).month() + 1, year: dayjs(value).year() });
              }}
            />
            <Select
              label="Referenční rok"
              value={String(period.year)}
              onChange={(value) => setPeriod((prev) => ({ ...prev, year: Number(value ?? prev.year) }))}
              data={Array.from({ length: 5 }).map((_, idx) => ({
                value: String(now.year() - 2 + idx),
                label: String(now.year() - 2 + idx),
              }))}
            />
          </Group>

          <FileInput
            label="Excel soubory"
            placeholder="Vyberte soubory (.xls, .xlsx)"
            accept=".xls,.xlsx"
            multiple
            onChange={(value) => addFiles('excel', value)}
            leftSection={<IconUpload size={16} />}
          />

          <Button
            variant="subtle"
            onClick={downloadTemplate}
            leftSection={<IconDownload size={16} />}
            loading={templateLoading}
          >
            Stáhnout vzorový soubor
          </Button>
        </Stack>
      </Card>

      {excelError ? (
        <Alert color="red" variant="light">
          {excelError}
        </Alert>
      ) : null}

      {renderQueue(excelQueue, 'excel')}

      <Group justify="space-between">
        <Button
          variant="subtle"
          onClick={() => resetQueue('excel')}
          disabled={!excelQueue.length || excelUploading}
        >
          Vyprázdnit seznam
        </Button>
        <Button
          leftSection={<IconUpload size={16} />}
          loading={excelUploading}
          onClick={handleExcelUpload}
          disabled={!excelQueue.length}
        >
          Spustit import
        </Button>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="md">
          <Title order={3}>Import přijatých faktur (PDF/ISDOC)</Title>
          <Text c="dimmed" size="sm">
            PDF soubory se odešlou na OCR, ISDOC se zpracují přímo – položky poté najdete v sekci Přijaté faktury, kde je schválíte nebo upravíte.
          </Text>
          <FileInput
            label="Faktury (PDF/ISDOC)"
            placeholder="Vyberte soubory (.pdf)"
            accept="application/pdf"
            multiple
            onChange={(value) => addFiles('invoice', value)}
            leftSection={<IconUpload size={16} />}
          />
        </Stack>
      </Card>

      {invoiceError ? (
        <Alert color="red" variant="light">
          {invoiceError}
        </Alert>
      ) : null}

      {renderQueue(invoiceQueue, 'invoice')}

      <Group justify="space-between">
        <Button
          variant="subtle"
          onClick={() => resetQueue('invoice')}
          disabled={!invoiceQueue.length || invoiceUploading}
        >
          Vyprázdnit seznam
        </Button>
        <Button
          leftSection={<IconUpload size={16} />}
          loading={invoiceUploading}
          onClick={handleInvoiceUpload}
          disabled={!invoiceQueue.length}
        >
          Nahrát faktury
        </Button>
      </Group>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Title order={4}>Formát Excel souboru</Title>
          <Text size="sm" c="dimmed">
            Soubor musí obsahovat záhlaví se jmény sloupců a data od druhého řádku.
          </Text>
          <Table withTableBorder verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Sloupec</Table.Th>
                <Table.Th>Popis</Table.Th>
                <Table.Th>Příklad</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td fw={500}>Datum</Table.Td>
                <Table.Td>Datum provedení práce</Table.Td>
                <Table.Td>15.7.2025</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Organizace</Table.Td>
                <Table.Td>Název organizace shodný s databází</Table.Td>
                <Table.Td>Lázně Toušeň</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Pracovník</Table.Td>
                <Table.Td>Jméno technika</Table.Td>
                <Table.Td>Jan Novák</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Popis</Table.Td>
                <Table.Td>Stručný popis vykonané práce</Table.Td>
                <Table.Td>Instalace softwaru</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Hodiny</Table.Td>
                <Table.Td>Počet odpracovaných hodin (HH:MM)</Table.Td>
                <Table.Td>2:30</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td fw={500}>Km</Table.Td>
                <Table.Td>Počet ujetých kilometrů</Table.Td>
                <Table.Td>25</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>
    </Stack>
  );
}
