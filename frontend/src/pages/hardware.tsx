import React, { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { API_URL } from '../config/api';
import { useRouter } from 'next/router';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface OrganizationOption {
  id: number;
  name: string;
  code?: string;
}

interface InvoiceItem {
  id: number;
  itemName: string;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  vatRate: number | null;
  status: string;
  invoice: {
    invoiceNumber: string;
    supplierName: string;
    issueDate: string | null;
  };
  assignedOrganizationId?: number | null;
  assignedMonth?: number | null;
  assignedYear?: number | null;
}

const HardwarePage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [pendingItems, setPendingItems] = useState<InvoiceItem[]>([]);
  const [assignedItems, setAssignedItems] = useState<InvoiceItem[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState<boolean>(true);
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

    const load = async () => {
      try {
        const [orgRes, pendingRes, assignedRes] = await Promise.all([
          fetch(`${API_URL}/api/organizations`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/api/received-invoices/items/list?status=APPROVED`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          fetch(`${API_URL}/api/received-invoices/items/list?status=ASSIGNED`, {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);

        if (!orgRes.ok || !pendingRes.ok || !assignedRes.ok) {
          throw new Error('Chyba při načítání dat');
        }

        const orgData = await orgRes.json();
        const list = Array.isArray(orgData) ? orgData : orgData.data;
        setOrganizations(list || []);
        if (list && list.length > 0) {
          setSelectedOrg(list[0].id);
        }

        const pending = await pendingRes.json();
        const assigned = await assignedRes.json();
        setPendingItems(pending || []);
        setAssignedItems(assigned || []);
      } catch (err: any) {
        setError(err.message || 'Chyba při načítání');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [router]);

  const monthOptions = useMemo(() => Array.from({ length: 12 }).map((_, idx) => ({
    value: idx + 1,
    label: new Date(2024, idx).toLocaleDateString('cs-CZ', { month: 'long' })
  })), []);

  const refreshLists = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const [pendingRes, assignedRes] = await Promise.all([
      fetch(`${API_URL}/api/received-invoices/items/list?status=APPROVED`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`${API_URL}/api/received-invoices/items/list?status=ASSIGNED`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);
    if (pendingRes.ok) {
      setPendingItems(await pendingRes.json());
    }
    if (assignedRes.ok) {
      setAssignedItems(await assignedRes.json());
    }
  };

  const assignItem = async (itemId: number) => {
    if (!selectedOrg) {
      setError('Vyberte organizaci');
      return;
    }

    try {
      setError('');
      setMessage('');
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/received-invoices/items/${itemId}/assign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organizationId: selectedOrg,
          month: selectedMonth,
          year: selectedYear
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Přiřazení selhalo');
      }

      setMessage('Položka byla přiřazena a přidána do hardware.');
      await refreshLists();
    } catch (err: any) {
      setError(err.message || 'Chyba při přiřazení');
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
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">Položky hardware z přijatých faktur</h1>

        {error && <div className="error-message">❌ {error}</div>}
        {message && <div className="info-box">✅ {message}</div>}

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Přiřazení položky</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-600 font-semibold">Organizace</label>
              <select
                value={selectedOrg ?? ''}
                onChange={(e) => setSelectedOrg(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.code ? `(${org.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 font-semibold">Měsíc</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-full"
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
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-yellow-100 px-4 py-3 font-bold text-yellow-800">
            Položky čekající na přiřazení ({pendingItems.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-yellow-50">
                <tr>
                  <th className="px-3 py-2 text-left">Dodavatel</th>
                  <th className="px-3 py-2 text-left">Faktura</th>
                  <th className="px-3 py-2 text-left">Položka</th>
                  <th className="px-3 py-2 text-right">Množství</th>
                  <th className="px-3 py-2 text-right">Cena</th>
                  <th className="px-3 py-2 text-center">Akce</th>
                </tr>
              </thead>
              <tbody>
                {pendingItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="px-3 py-2">{item.invoice?.supplierName}</td>
                    <td className="px-3 py-2">{item.invoice?.invoiceNumber}</td>
                    <td className="px-3 py-2">{item.itemName}</td>
                    <td className="px-3 py-2 text-right">{item.quantity ?? '-'}</td>
                    <td className="px-3 py-2 text-right">
                      {item.totalPrice !== null && item.totalPrice !== undefined
                        ? Number(item.totalPrice).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })
                        : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button
                        className="btn btn-primary"
                        onClick={() => assignItem(item.id)}
                      >
                        Přiřadit
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Žádné položky ke schválení.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="bg-green-100 px-4 py-3 font-bold text-green-800">
            Přiřazené položky ({assignedItems.length})
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-green-50">
                <tr>
                  <th className="px-3 py-2 text-left">Dodavatel</th>
                  <th className="px-3 py-2 text-left">Faktura</th>
                  <th className="px-3 py-2 text-left">Položka</th>
                  <th className="px-3 py-2 text-left">Organizace</th>
                  <th className="px-3 py-2 text-right">Měsíc/Rok</th>
                  <th className="px-3 py-2 text-right">Cena</th>
                </tr>
              </thead>
              <tbody>
                {assignedItems.map((item) => (
                  <tr key={item.id} className="border-b border-gray-200">
                    <td className="px-3 py-2">{item.invoice?.supplierName}</td>
                    <td className="px-3 py-2">{item.invoice?.invoiceNumber}</td>
                    <td className="px-3 py-2">{item.itemName}</td>
                    <td className="px-3 py-2">
                      {organizations.find((org) => org.id === item.assignedOrganizationId)?.name || '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.assignedMonth && item.assignedYear ? `${item.assignedMonth}/${item.assignedYear}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {item.totalPrice !== null && item.totalPrice !== undefined
                        ? Number(item.totalPrice).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })
                        : '-'}
                    </td>
                  </tr>
                ))}
                {assignedItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      Zatím žádné položky nebyly přiřazeny.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HardwarePage;
