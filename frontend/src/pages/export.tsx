import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { API_URL } from '../config/api';

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
  };
  month: number;
  year: number;
  totalAmount: string;
  status: string;
  generatedAt: string;
  pohodaXml?: string;
}

export default function Export() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoices, setSelectedInvoices] = useState<number[]>([]);
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
  const [message, setMessage] = useState({ type: '', text: '' });

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
  }, [router, filters]);

  const fetchInvoices = async (token: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        month: filters.month.toString(),
        year: filters.year.toString(),
        limit: '100'
      });

      const response = await fetch(`${API_URL}/api/invoices?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setInvoices(data.data || []);
      } else {
        console.error('Failed to fetch invoices');
        setMessage({ type: 'error', text: 'Nepodařilo se načíst faktury' });
      }
    } catch (error) {
      console.error('Error fetching invoices:', error);
      setMessage({ type: 'error', text: 'Chyba při načítání faktur' });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = () => {
    if (selectedInvoices.length === invoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(invoices.map(inv => inv.id));
    }
  };

  const handleSelectInvoice = (id: number) => {
    if (selectedInvoices.includes(id)) {
      setSelectedInvoices(selectedInvoices.filter(i => i !== id));
    } else {
      setSelectedInvoices([...selectedInvoices, id]);
    }
  };

  const handleExport = async (format: 'individual' | 'batch') => {
    if (selectedInvoices.length === 0) {
      setMessage({ type: 'error', text: 'Vyberte prosím alespoň jednu fakturu' });
      return;
    }

    setExporting(true);
    setMessage({ type: '', text: '' });
    const token = localStorage.getItem('token');

    try {
      if (format === 'batch') {
        // Export všech vybraných faktur do jednoho XML
        const response = await fetch(`${API_URL}/api/invoices/export-batch`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ invoiceIds: selectedInvoices })
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `pohoda-export-${filters.year}-${filters.month}.xml`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          setMessage({ type: 'success', text: 'Export byl úspěšně stažen' });
          setSelectedInvoices([]);
        } else {
          const error = await response.json();
          setMessage({ type: 'error', text: error.error || 'Export se nezdařil' });
        }
      } else {
        // Export jednotlivých faktur
        let successCount = 0;
        let errorCount = 0;

        for (const invoiceId of selectedInvoices) {
          try {
            const response = await fetch(`${API_URL}/api/invoices/${invoiceId}/export`, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });

            if (response.ok) {
              const blob = await response.blob();
              const invoice = invoices.find(i => i.id === invoiceId);
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `pohoda-${invoice?.invoiceNumber}.xml`;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(url);
              document.body.removeChild(a);
              successCount++;
            } else {
              errorCount++;
            }
          } catch (error) {
            errorCount++;
          }
        }

        if (errorCount === 0) {
          setMessage({ type: 'success', text: `Úspěšně exportováno ${successCount} faktur` });
        } else {
          setMessage({ 
            type: 'warning', 
            text: `Exportováno ${successCount} faktur, ${errorCount} selhalo` 
          });
        }
        setSelectedInvoices([]);
      }
    } catch (error) {
      console.error('Error exporting:', error);
      setMessage({ type: 'error', text: 'Chyba při exportu' });
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('cs-CZ');
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: { class: string; text: string } } = {
      DRAFT: { class: 'status-draft', text: 'Koncept' },
      SENT: { class: 'status-sent', text: 'Odesláno' },
      PAID: { class: 'status-paid', text: 'Zaplaceno' },
      CANCELLED: { class: 'status-cancelled', text: 'Zrušeno' }
    };
    const statusInfo = statusMap[status] || { class: 'status-pending', text: status };
    return <span className={`status-badge ${statusInfo.class}`}>{statusInfo.text}</span>;
  };

  if (!user) {
    return null;
  }

  return (
    <Layout user={user}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1>Export do Pohoda XML</h1>
          <Link href="/dashboard" className="btn btn-outline">
            ← Zpět na dashboard
          </Link>
        </div>

        {message.text && (
          <div className={`message message-${message.type}`}>
            {message.text}
          </div>
        )}

        <div className="info-box">
          <h3>ℹ️ Informace o exportu</h3>
          <ul>
            <li>Export vytvoří XML soubor kompatibilní s účetním systémem Pohoda</li>
            <li>Můžete exportovat jednotlivé faktury nebo všechny vybrané najednou</li>
            <li>Exportují se pouze faktury ve stavu "Koncept" nebo "Odesláno"</li>
            <li>Po exportu můžete soubor importovat přímo do systému Pohoda</li>
          </ul>
        </div>

        <div className="filter-section">
          <div className="filter-row">
            <div className="filter-item">
              <label>Měsíc:</label>
              <select
                value={filters.month}
                onChange={(e) => setFilters({ ...filters, month: parseInt(e.target.value) })}
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2024, i).toLocaleDateString('cs-CZ', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="filter-item">
              <label>Rok:</label>
              <select
                value={filters.year}
                onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="table-container">
          <div className="table-header">
            <span>FAKTURY K EXPORTU - {filters.month}/{filters.year}</span>
            <div className="export-actions">
              <button
                className="btn btn-primary btn-small"
                onClick={() => handleExport('batch')}
                disabled={selectedInvoices.length === 0 || exporting}
              >
                Exportovat vybrané ({selectedInvoices.length})
              </button>
              <button
                className="btn btn-secondary btn-small"
                onClick={() => handleExport('individual')}
                disabled={selectedInvoices.length === 0 || exporting}
              >
                Exportovat jednotlivě
              </button>
            </div>
          </div>

          {loading ? (
            <div className="loading-state">Načítání faktur...</div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              Žádné faktury k exportu pro {filters.month}/{filters.year}
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>
                    <input
                      type="checkbox"
                      checked={selectedInvoices.length === invoices.length && invoices.length > 0}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th>Číslo faktury</th>
                  <th>Organizace</th>
                  <th>Vytvořeno</th>
                  <th style={{ textAlign: 'right' }}>Částka bez DPH</th>
                  <th style={{ textAlign: 'center' }}>Stav</th>
                  <th style={{ textAlign: 'center' }}>XML</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedInvoices.includes(invoice.id)}
                        onChange={() => handleSelectInvoice(invoice.id)}
                      />
                    </td>
                    <td>
                      <Link href={`/invoices/${invoice.id}`}>
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td>{invoice.organization.name}</td>
                    <td>{formatDate(invoice.generatedAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {parseFloat(invoice.totalAmount).toLocaleString('cs-CZ')} Kč
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {invoice.pohodaXml ? (
                        <span style={{ color: 'var(--status-success)' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style jsx>{`
        .message {
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .message-success {
          background: #D4EDDA;
          color: #155724;
          border: 1px solid #C3E6CB;
        }

        .message-error {
          background: #F8D7DA;
          color: #721C24;
          border: 1px solid #F5C6CB;
        }

        .message-warning {
          background: #FFF3CD;
          color: #856404;
          border: 1px solid #FFEAA7;
        }

        .info-box {
          background: var(--info-box);
          border: 1px solid #FFCC80;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .info-box h3 {
          margin-top: 0;
          color: var(--status-warning);
        }

        .info-box ul {
          margin: 10px 0;
          padding-left: 20px;
        }

        .info-box li {
          margin-bottom: 5px;
        }

        .filter-section {
          background: var(--white);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .filter-row {
          display: flex;
          gap: 20px;
          align-items: flex-end;
        }

        .filter-item {
          flex: 1;
          min-width: 200px;
        }

        .filter-item label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .filter-item select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
        }

        .table-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--section-header);
          padding: 15px 20px;
          font-weight: bold;
          border-bottom: 2px solid var(--primary-green);
        }

        .export-actions {
          display: flex;
          gap: 10px;
        }

        .btn-small {
          padding: 6px 12px;
          font-size: 14px;
        }

        .loading-state,
        .empty-state {
          padding: 40px;
          text-align: center;
          color: var(--text-secondary);
        }

        table input[type="checkbox"] {
          cursor: pointer;
        }

        table a {
          color: var(--primary-blue);
          text-decoration: none;
        }

        table a:hover {
          text-decoration: underline;
        }
      `}</style>
    </Layout>
  );
}