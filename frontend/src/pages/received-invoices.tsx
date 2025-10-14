import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { API_URL } from '../config/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface ReceivedInvoiceItem {
  id: number;
  itemName: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  vatRate: number | null;
  status: string;
}

interface ReceivedInvoice {
  id: number;
  supplierName: string;
  supplierIco?: string | null;
  invoiceNumber: string;
  issueDate?: string | null;
  status: string;
  items?: ReceivedInvoiceItem[];
}

const toNumber = (value: any) => {
  if (value === null || value === undefined || value === '') return '';
  return value;
};

const ReceivedInvoicesPage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [invoices, setInvoices] = useState<ReceivedInvoice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [items, setItems] = useState<ReceivedInvoiceItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

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

    const loadInvoices = async () => {
      try {
        const response = await fetch(`${API_URL}/api/received-invoices`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) {
          throw new Error('Nepodařilo se načíst faktury');
        }
        const data: ReceivedInvoice[] = await response.json();
        setInvoices(data);
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Chyba při načítání');
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [router]);

  useEffect(() => {
    const fetchDetail = async () => {
      if (!selectedId) {
        setItems([]);
        return;
      }

      setDetailLoading(true);
      setMessage('');
      setError('');

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/received-invoices/${selectedId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) {
          throw new Error('Nepodařilo se načíst detail faktury');
        }
        const data = await response.json();
        setItems(
          (data.items || []).map((item: any) => ({
            ...item,
            quantity: item.quantity !== null ? Number(item.quantity) : null,
            unitPrice: item.unitPrice !== null ? Number(item.unitPrice) : null,
            totalPrice: item.totalPrice !== null ? Number(item.totalPrice) : null,
            vatRate: item.vatRate !== null ? Number(item.vatRate) : null
          }))
        );
      } catch (err: any) {
        setError(err.message || 'Chyba při načítání položek');
      } finally {
        setDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId]);

  const updateItem = (index: number, field: keyof ReceivedInvoiceItem, value: any) => {
    setItems((prev) => {
      const clone = [...prev];
      const updated = { ...clone[index] } as any;
      if (['quantity', 'unitPrice', 'totalPrice', 'vatRate'].includes(field)) {
        updated[field] = value === '' ? null : Number(value);
      } else {
        updated[field] = value;
      }
      clone[index] = updated;
      return clone;
    });
  };

  const saveItems = async () => {
    if (!selectedId) return;
    try {
      setMessage('');
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/received-invoices/${selectedId}/items`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Uložení selhalo');
      }
      setMessage('Položky uloženy.');
    } catch (err: any) {
      setError(err.message || 'Chyba při ukládání');
    }
  };

  const changeStatus = async (action: 'approve' | 'reject') => {
    if (!selectedId) return;
    try {
      setMessage('');
      setError('');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/received-invoices/${selectedId}/${action}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Operace selhala');
      }
      setMessage(action === 'approve' ? 'Faktura označena jako připravená.' : 'Faktura archivována.');
      // Refresh seznamu
      const refreshed = await fetch(`${API_URL}/api/received-invoices`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then((res) => res.json());
      setInvoices(refreshed);
    } catch (err: any) {
      setError(err.message || 'Chyba při změně stavu');
    }
  };

  if (!user || loading) {
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
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/3 bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-blue-600 text-white px-4 py-3 font-bold">
            Přijaté faktury
          </div>
          <ul className="divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className={`px-4 py-3 cursor-pointer ${invoice.id === selectedId ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={() => setSelectedId(invoice.id)}
              >
                <div className="font-semibold text-gray-800">{invoice.invoiceNumber}</div>
                <div className="text-sm text-gray-500">{invoice.supplierName}</div>
                <div className="text-xs text-gray-400">{invoice.status}</div>
              </li>
            ))}
            {invoices.length === 0 && (
              <li className="px-4 py-6 text-center text-gray-500">Žádné faktury zatím nebyly nahrány.</li>
            )}
          </ul>
        </div>

        <div className="md:flex-1 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="bg-gray-100 px-4 py-3 font-bold text-gray-700 flex items-center justify-between">
            <span>Detail faktury</span>
            <div className="flex gap-2">
              <button
                className="btn btn-secondary"
                onClick={saveItems}
                disabled={!selectedId || detailLoading}
              >
                Uložit změny
              </button>
              <button
                className="btn btn-primary"
                onClick={() => changeStatus('approve')}
                disabled={!selectedId || detailLoading}
              >
                Schválit
              </button>
              <button
                className="btn btn-outline"
                onClick={() => changeStatus('reject')}
                disabled={!selectedId || detailLoading}
              >
                Archivovat
              </button>
            </div>
          </div>
          <div className="p-4">
            {error && (
              <div className="error-message mb-3">❌ {error}</div>
            )}
            {message && (
              <div className="info-box mb-3">✅ {message}</div>
            )}

            {detailLoading ? (
              <div className="text-gray-500">Načítám položky...</div>
            ) : items.length === 0 ? (
              <div className="text-gray-500">Vyberte fakturu pro zobrazení položek.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left">Položka</th>
                      <th className="px-3 py-2 text-left">Popis</th>
                      <th className="px-3 py-2 text-right">Množství</th>
                      <th className="px-3 py-2 text-right">Cena/ks</th>
                      <th className="px-3 py-2 text-right">Celkem</th>
                      <th className="px-3 py-2 text-right">DPH %</th>
                      <th className="px-3 py-2 text-center">Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => (
                      <tr key={item.id} className="border-b border-gray-200">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => updateItem(index, 'itemName', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => updateItem(index, 'description', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 w-full"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={toNumber(item.quantity)}
                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={toNumber(item.unitPrice)}
                            onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={toNumber(item.totalPrice)}
                            onChange={(e) => updateItem(index, 'totalPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={toNumber(item.vatRate)}
                            onChange={(e) => updateItem(index, 'vatRate', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-500">{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ReceivedInvoicesPage;
