import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { API_URL } from '../../config/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface Invoice {
  id: number;
  invoiceNumber: string;
  organization: {
    id: number;
    name: string;
    code: string;
    ico?: string;
    dic?: string;
  };
  month: number;
  year: number;
  totalAmount: string;
  totalVat: string;
  status: string;
  generatedAt: string;
  pdfUrl?: string;
}

interface InvoiceStats {
  currentMonth: number;
  unpaid: number;
  paid: number;
  total: number;
}

export default function Invoices() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<InvoiceStats>({
    currentMonth: 0,
    unpaid: 0,
    paid: 0,
    total: 0
  });
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    status: ''
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
    fetchInvoices(token);
  }, [router, filters, currentPage]);

  const fetchInvoices = async (token: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: '20',
        month: filters.month.toString(),
        year: filters.year.toString()
      });
      
      if (filters.status) {
        params.append('status', filters.status);
      }

      const response = await fetch(`${API_URL}/api/invoices?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.data || []);
        setTotalPages(data.pagination?.pages || 1);
        calculateStats(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (invoiceList: Invoice[]) => {
    const stats = invoiceList.reduce((acc, inv) => {
      const amount = parseFloat(inv.totalAmount);
      acc.total++;
      acc.currentMonth += amount;
      
      if (inv.status === 'PAID') {
        acc.paid += amount;
      } else if (inv.status === 'SENT' || inv.status === 'DRAFT') {
        acc.unpaid += amount;
      }
      
      return acc;
    }, {
      currentMonth: 0,
      unpaid: 0,
      paid: 0,
      total: 0
    });
    
    setStats(stats);
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    const token = localStorage.getItem('token');
    
    try {
      const response = await fetch(`${API_URL}/api/invoices/${invoiceId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faktura-${invoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading PDF:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusStyles = {
      DRAFT: 'bg-gray-100 text-gray-700',
      SENT: 'bg-blue-100 text-blue-700',
      PAID: 'bg-green-100 text-green-700',
      CANCELLED: 'bg-red-100 text-red-700'
    };
    
    const statusTexts = {
      DRAFT: 'Koncept',
      SENT: 'Odesláno',
      PAID: 'Zaplaceno',
      CANCELLED: 'Zrušeno'
    };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${statusStyles[status as keyof typeof statusStyles] || 'bg-gray-100 text-gray-700'}`}>
        {statusTexts[status as keyof typeof statusTexts] || status}
      </span>
    );
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Načítání...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Faktury</h1>
          <Link href="/invoices/new">
            <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
              + Nová faktura
            </button>
          </Link>
        </div>

        {/* Filtry */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Měsíc</label>
              <select
                value={filters.month}
                onChange={(e) => setFilters({...filters, month: parseInt(e.target.value)})}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2024, i).toLocaleDateString('cs-CZ', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rok</label>
              <select
                value={filters.year}
                onChange={(e) => setFilters({...filters, year: parseInt(e.target.value)})}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stav</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({...filters, status: e.target.value})}
                className="px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              >
                <option value="">Všechny stavy</option>
                <option value="DRAFT">Koncept</option>
                <option value="SENT">Odesláno</option>
                <option value="PAID">Zaplaceno</option>
                <option value="CANCELLED">Zrušeno</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
          <div className="bg-green-600 text-white px-4 py-3 font-bold">
            SEZNAM FAKTUR - {filters.month}/{filters.year}
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Číslo faktury</th>
                <th className="text-left">Organizace</th>
                <th className="text-center">Datum vytvoření</th>
                <th className="text-right">Částka bez DPH</th>
                <th className="text-right">DPH</th>
                <th className="text-right">Celkem</th>
                <th className="text-center">Stav</th>
                <th className="text-center">Akce</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="font-bold">{invoice.invoiceNumber}</td>
                  <td>
                    {invoice.organization.name}
                    <br />
                    <span className="text-xs text-gray-500">
                      IČO: {invoice.organization.ico || 'Nevyplněno'}
                    </span>
                  </td>
                  <td className="text-center">
                    {new Date(invoice.generatedAt).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="text-right">{parseFloat(invoice.totalAmount).toLocaleString('cs-CZ')} Kč</td>
                  <td className="text-right">{parseFloat(invoice.totalVat).toLocaleString('cs-CZ')} Kč</td>
                  <td className="text-right font-bold">
                    {(parseFloat(invoice.totalAmount) + parseFloat(invoice.totalVat)).toLocaleString('cs-CZ')} Kč
                  </td>
                  <td className="text-center">
                    {getStatusBadge(invoice.status)}
                  </td>
                  <td className="text-center">
                    <Link href={`/invoices/${invoice.id}`}>
                      <button className="text-blue-600 hover:underline text-sm mr-2">
                        Zobrazit
                      </button>
                    </Link>
                    <button 
                      onClick={() => handleDownloadPDF(invoice.id)}
                      className="text-green-600 hover:underline text-sm"
                    >
                      PDF
                    </button>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-gray-500 py-8">
                    Žádné faktury k zobrazení
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          {/* Paginace */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex justify-between items-center">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50"
              >
                Předchozí
              </button>
              <span className="text-sm text-gray-600">
                Strana {currentPage} z {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-50"
              >
                Další
              </button>
            </div>
          )}
        </div>

        {/* Souhrn */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
            <p className="text-sm text-gray-600">Tento měsíc</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.currentMonth.toLocaleString('cs-CZ')} Kč
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
            <p className="text-sm text-gray-600">Nezaplacené</p>
            <p className="text-2xl font-bold text-orange-600">
              {stats.unpaid.toLocaleString('cs-CZ')} Kč
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
            <p className="text-sm text-gray-600">Zaplacené</p>
            <p className="text-2xl font-bold text-blue-600">
              {stats.paid.toLocaleString('cs-CZ')} Kč
            </p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 p-4">
            <p className="text-sm text-gray-600">Počet faktur</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}