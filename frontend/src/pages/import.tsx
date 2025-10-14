import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { API_URL } from '../config/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

type QueueStatus = 'pending' | 'uploading' | 'success' | 'error';

interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  progress: number;
  message: string;
}

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const uploadWithProgress = (
  url: string,
  token: string,
  formData: FormData,
  onProgress: (progress: number) => void
) =>
  new Promise<{ status: number; body: any }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.responseType = 'text';

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const percent = Math.round((evt.loaded / evt.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onerror = () => reject(new Error('Chyba při odesílání souboru'));

    xhr.onload = () => {
      const status = xhr.status;
      let body: any = xhr.responseText;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch (err) {
        // ignorujeme, necháme text
      }
      if (status >= 200 && status < 300) {
        resolve({ status, body });
      } else {
        const message = body?.error || xhr.statusText || 'Chyba serveru';
        reject(new Error(message));
      }
    };

    xhr.send(formData);
  });

const ImportPage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);
  const [year, setYear] = useState<number>(new Date().getFullYear());

  const [excelQueue, setExcelQueue] = useState<QueueItem[]>([]);
  const [invoiceQueue, setInvoiceQueue] = useState<QueueItem[]>([]);

  const [excelUploading, setExcelUploading] = useState<boolean>(false);
  const [invoiceUploading, setInvoiceUploading] = useState<boolean>(false);

  const [excelError, setExcelError] = useState<string>('');
  const [invoiceError, setInvoiceError] = useState<string>('');

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, idx) => ({
        value: idx + 1,
        label: new Date(2024, idx).toLocaleDateString('cs-CZ', { month: 'long' })
      })),
    []
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) {
      router.push('/login');
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, [router]);

  const appendToQueue = (
    files: FileList | null,
    setter: React.Dispatch<React.SetStateAction<QueueItem[]>>
  ) => {
    if (!files || files.length === 0) return;
    setter((prev) => [
      ...prev,
      ...Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: 'pending' as QueueStatus,
        progress: 0,
        message: ''
      }))
    ]);
  };

  const removeFromQueue = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<QueueItem[]>>
  ) => {
    setter((prev) => prev.filter((item) => item.id !== id));
  };

  const resetQueue = (
    setter: React.Dispatch<React.SetStateAction<QueueItem[]>>
  ) => setter([]);

  const updateQueueItem = (
    setter: React.Dispatch<React.SetStateAction<QueueItem[]>>,
    id: string,
    data: Partial<QueueItem>
  ) => {
    setter((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...data } : item))
    );
  };

  const handleExcelUpload = async () => {
    if (excelQueue.length === 0) {
      setExcelError('Přidejte alespoň jeden Excel soubor.');
      return;
    }
    if (!month || !year) {
      setExcelError('Vyberte měsíc a rok.');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setExcelError('Chybí token. Přihlaste se prosím znovu.');
      return;
    }

    setExcelUploading(true);
    setExcelError('');

    for (const item of excelQueue) {
      if (item.status === 'success') continue;

      updateQueueItem(setExcelQueue, item.id, {
        status: 'uploading',
        progress: 0,
        message: ''
      });

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('month', String(month));
      formData.append('year', String(year));

      try {
        const response = await uploadWithProgress(
          `${API_URL}/api/import`,
          token,
          formData,
          (progress) => updateQueueItem(setExcelQueue, item.id, { progress })
        );

        const body = response.body || {};
        const message = body.recordsCount
          ? `Načteno ${body.recordsCount} záznamů.`
          : 'Import dokončen.';

        updateQueueItem(setExcelQueue, item.id, {
          status: 'success',
          progress: 100,
          message
        });
      } catch (err: any) {
        updateQueueItem(setExcelQueue, item.id, {
          status: 'error',
          message: err.message || 'Import selhal'
        });
      }
    }

    setExcelUploading(false);
  };

  const handleInvoiceUpload = async () => {
    if (invoiceQueue.length === 0) {
      setInvoiceError('Přidejte alespoň jeden soubor faktury (PDF).');
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      setInvoiceError('Chybí token. Přihlaste se prosím znovu.');
      return;
    }

    setInvoiceUploading(true);
    setInvoiceError('');

    for (const item of invoiceQueue) {
      if (item.status === 'success') continue;

      updateQueueItem(setInvoiceQueue, item.id, {
        status: 'uploading',
        progress: 0,
        message: ''
      });

      const formData = new FormData();
      formData.append('file', item.file);

      try {
        const response = await uploadWithProgress(
          `${API_URL}/api/received-invoices/upload`,
          token,
          formData,
          (progress) => updateQueueItem(setInvoiceQueue, item.id, { progress })
        );

        const body = response.body || {};
        const message = body.items
          ? `Načteno ${body.items.length} položek.`
          : 'Faktura nahrána.';

        updateQueueItem(setInvoiceQueue, item.id, {
          status: 'success',
          progress: 100,
          message
        });
      } catch (err: any) {
        updateQueueItem(setInvoiceQueue, item.id, {
          status: 'error',
          message: err.message || 'Import selhal'
        });
      }
    }

    setInvoiceUploading(false);
  };

  const renderQueueTable = (
    title: string,
    queue: QueueItem[],
    onRemove: (id: string) => void
  ) => (
    <table className="min-w-full text-sm">
      <thead className="bg-gray-100">
        <tr>
          <th className="px-3 py-2 text-left">Soubor</th>
          <th className="px-3 py-2 text-left">Velikost</th>
          <th className="px-3 py-2 text-left">Stav</th>
          <th className="px-3 py-2 text-left">Zpráva</th>
          <th className="px-3 py-2 text-center">Akce</th>
        </tr>
      </thead>
      <tbody>
        {queue.map((item) => (
          <tr key={item.id} className="border-b border-gray-200">
            <td className="px-3 py-2">{item.file.name}</td>
            <td className="px-3 py-2">{formatFileSize(item.file.size)}</td>
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span>
                  {item.status === 'pending' && 'Čeká'}
                  {item.status === 'uploading' && 'Nahrávám...'}
                  {item.status === 'success' && 'Hotovo'}
                  {item.status === 'error' && 'Chyba'}
                </span>
                {(item.status === 'uploading' || item.progress > 0) && (
                  <div className="flex-1">
                    <div className="h-2 bg-gray-200 rounded">
                      <div
                        className={`h-full rounded ${
                          item.status === 'error' ? 'bg-red-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </td>
            <td className="px-3 py-2 text-sm text-gray-600">
              {item.message}
            </td>
            <td className="px-3 py-2 text-center">
              {item.status === 'pending' && (
                <button
                  className="text-sm text-red-600 hover:underline"
                  onClick={() => onRemove(item.id)}
                >
                  Odebrat
                </button>
              )}
            </td>
          </tr>
        ))}
        {queue.length === 0 && (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
              Zatím žádné soubory.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Načítání...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user}>
      <div className="space-y-10">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Import Excel výkazů</h1>
          <p className="text-sm text-gray-600 mb-4">
            Nahrajte jeden nebo více Excel souborů (.xlsx, .xls). Systém je zpracuje postupně
            s vybraným měsícem a rokem.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-600 font-semibold">Měsíc</label>
              <select
                value={month}
                onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                disabled={excelUploading}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 font-semibold">Rok</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                disabled={excelUploading}
              />
            </div>
            <div className="flex items-end justify-end gap-2">
              <button
                className="btn btn-outline"
                onClick={() => resetQueue(setExcelQueue)}
                disabled={excelUploading || excelQueue.length === 0}
              >
                Vyprázdnit seznam
              </button>
              <button
                className="btn btn-success"
                onClick={handleExcelUpload}
                disabled={excelUploading || excelQueue.length === 0}
              >
                {excelUploading ? 'Nahrávám...' : 'Spustit import'}
              </button>
            </div>
          </div>

          {excelError && <div className="error-message mb-4">❌ {excelError}</div>}

          <div
            className={`drop-zone ${excelUploading ? 'disabled' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              appendToQueue(e.dataTransfer.files, setExcelQueue);
            }}
          >
            <div className="drop-prompt">
              <div className="upload-icon">⬆️</div>
              <p className="drop-text">Přetáhněte soubory sem nebo klikněte pro výběr</p>
              <input
                id="excel-input"
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={(e) => appendToQueue(e.target.files, setExcelQueue)}
                disabled={excelUploading}
                style={{ display: 'none' }}
              />
              <label htmlFor="excel-input" className="btn btn-primary" style={{ cursor: 'pointer' }}>
                Vybrat soubory
              </label>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {renderQueueTable('Excel', excelQueue, (id) => removeFromQueue(id, setExcelQueue))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Import přijatých faktur (OCR)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Nahrajte PDF faktury. Každá bude odeslána na OCR Mistral a položky následně schvalujete v záložce „Faktury přijaté“.
          </p>

          <div className="flex items-center justify-between mb-4">
            <button
              className="btn btn-outline"
              onClick={() => resetQueue(setInvoiceQueue)}
              disabled={invoiceUploading || invoiceQueue.length === 0}
            >
              Vyprázdnit seznam
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleInvoiceUpload}
              disabled={invoiceUploading || invoiceQueue.length === 0}
            >
              {invoiceUploading ? 'Nahrávám...' : 'Spustit import faktur'}
            </button>
          </div>

          {invoiceError && <div className="error-message mb-4">❌ {invoiceError}</div>}

          <div
            className={`drop-zone ${invoiceUploading ? 'disabled' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              appendToQueue(e.dataTransfer.files, setInvoiceQueue);
            }}
          >
            <div className="drop-prompt">
              <div className="upload-icon">📄</div>
              <p className="drop-text">Přetáhněte PDF faktury sem nebo klikněte pro výběr</p>
              <input
                id="invoice-input"
                type="file"
                accept="application/pdf"
                multiple
                onChange={(e) => appendToQueue(e.target.files, setInvoiceQueue)}
                disabled={invoiceUploading}
                style={{ display: 'none' }}
              />
              <label htmlFor="invoice-input" className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                Vybrat faktury
              </label>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            {renderQueueTable('Faktury', invoiceQueue, (id) => removeFromQueue(id, setInvoiceQueue))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
          <div className="section-header mb-4">📋 FORMÁT EXCEL SOUBORU</div>
          <p className="mb-4 text-sm text-gray-600">
            Excel soubor musí obsahovat následující sloupce:
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left">Sloupec</th>
                  <th className="px-3 py-2 text-left">Popis</th>
                  <th className="px-3 py-2 text-left">Příklad</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2 font-semibold">Datum</td>
                  <td className="px-3 py-2">Datum provedení práce</td>
                  <td className="px-3 py-2">15.7.2025</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Organizace</td>
                  <td className="px-3 py-2">Název organizace</td>
                  <td className="px-3 py-2">Lázně Toušeň</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Pracovník</td>
                  <td className="px-3 py-2">Jméno pracovníka</td>
                  <td className="px-3 py-2">Jan Novák</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Popis</td>
                  <td className="px-3 py-2">Popis vykonané práce</td>
                  <td className="px-3 py-2">Instalace softwaru</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Hodiny</td>
                  <td className="px-3 py-2">Počet odpracovaných hodin</td>
                  <td className="px-3 py-2">2:30</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 font-semibold">Km</td>
                  <td className="px-3 py-2">Počet ujetých kilometrů</td>
                  <td className="px-3 py-2">25</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-4 bg-yellow-50 border border-yellow-200 text-sm text-yellow-800 p-3 rounded">
            💡 Tip: první řádek musí obsahovat názvy sloupců. Data začínají od druhého řádku.
          </div>
        </div>
      </div>

      <style jsx>{`
        .drop-zone {
          border: 2px dashed var(--border-color);
          border-radius: 10px;
          padding: 30px;
          text-align: center;
          transition: border-color 0.2s ease;
          background: var(--white);
        }

        .drop-zone.disabled {
          opacity: 0.6;
          pointer-events: none;
        }

        .drop-zone:hover {
          border-color: var(--primary-green);
        }

        .drop-prompt {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          color: var(--text-secondary);
        }

        .upload-icon {
          font-size: 32px;
        }

        .drop-text {
          font-size: 14px;
        }

        .error-message {
          background: #fdecea;
          border: 1px solid #f5c2c7;
          color: #b02a37;
          padding: 12px 16px;
          border-radius: 6px;
        }
      `}</style>
    </Layout>
  );
};

export default ImportPage;
