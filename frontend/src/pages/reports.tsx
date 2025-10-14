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

interface OrganizationReport {
  organization: {
    id: number;
    name: string;
    code: string;
  };
  recordsCount: number;
  totalHours: string;
  totalKm: number;
  hourlyAmount: string;
  kmAmount: string;
  totalAmount: string;
  invoice: {
    status: string;
    invoiceNumber: string;
  } | null;
}

interface MonthlyStats {
  totalOrganizations: number;
  totalRecords: number;
  totalHours: string;
  totalKm: number;
  totalAmount: string;
  totalInvoiced: string;
  totalPending: string;
  invoicedCount: number;
  pendingCount: number;
}

export default function Reports() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<OrganizationReport[]>([]);
  const [stats, setStats] = useState<MonthlyStats>({
    totalOrganizations: 0,
    totalRecords: 0,
    totalHours: '0',
    totalKm: 0,
    totalAmount: '0',
    totalInvoiced: '0',
    totalPending: '0',
    invoicedCount: 0,
    pendingCount: 0
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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
    
    fetchReport(token);
  }, [router, selectedMonth, selectedYear]);

  const fetchReport = async (token: string) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/work-records/summary/${selectedYear}/${selectedMonth}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data);
        calculateStats(data);
      } else {
        console.error('Failed to fetch report');
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: OrganizationReport[]) => {
    const stats = data.reduce((acc, org) => {
      acc.totalOrganizations += 1;
      acc.totalRecords += org.recordsCount;
      acc.totalHours += parseFloat(org.totalHours);
      acc.totalKm += org.totalKm;
      acc.totalAmount += parseFloat(org.totalAmount);
      
      if (org.invoice) {
        acc.invoicedCount += 1;
        acc.totalInvoiced += parseFloat(org.totalAmount);
      } else {
        acc.pendingCount += 1;
        acc.totalPending += parseFloat(org.totalAmount);
      }
      
      return acc;
    }, {
      totalOrganizations: 0,
      totalRecords: 0,
      totalHours: 0,
      totalKm: 0,
      totalAmount: 0,
      totalInvoiced: 0,
      totalPending: 0,
      invoicedCount: 0,
      pendingCount: 0
    });

    setStats({
      ...stats,
      totalHours: stats.totalHours.toFixed(2),
      totalAmount: stats.totalAmount.toFixed(2),
      totalInvoiced: stats.totalInvoiced.toFixed(2),
      totalPending: stats.totalPending.toFixed(2)
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ['Organizace', 'Kód', 'Počet záznamů', 'Hodiny', 'Km', 'Za hodiny', 'Za km', 'Celkem', 'Stav faktury'];
    const rows = organizations.map(org => [
      org.organization.name,
      org.organization.code,
      org.recordsCount,
      org.totalHours,
      org.totalKm,
      org.hourlyAmount,
      org.kmAmount,
      org.totalAmount,
      org.invoice ? org.invoice.status : 'Nevyfakturováno'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${selectedYear}-${selectedMonth}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (!user) {
    return null;
  }

  const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('cs-CZ', { 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <Layout user={user}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1>Měsíční report - {monthName}</h1>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px'
              }}
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2024, i).toLocaleDateString('cs-CZ', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px'
              }}
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button onClick={handlePrint} className="btn btn-outline no-print">
              🖨️ Tisk
            </button>
            <button onClick={handleExportCSV} className="btn btn-secondary no-print">
              📊 Export CSV
            </button>
            <Link href="/dashboard" className="btn btn-outline no-print">
              ← Dashboard
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="loading-state">Načítání reportu...</div>
        ) : (
          <>
            {/* Souhrn statistik */}
            <div className="stats-grid">
              <div className="stat-card">
                <h3>CELKEM ORGANIZACÍ</h3>
                <div className="value">{stats.totalOrganizations}</div>
                <div className="description">s daty v tomto měsíci</div>
              </div>
              <div className="stat-card">
                <h3>POČET ZÁZNAMŮ</h3>
                <div className="value">{stats.totalRecords}</div>
                <div className="description">pracovních výkazů</div>
              </div>
              <div className="stat-card">
                <h3>ODPRACOVANÉ HODINY</h3>
                <div className="value">{stats.totalHours} h</div>
                <div className="description">celkem tento měsíc</div>
              </div>
              <div className="stat-card">
                <h3>UJETÉ KILOMETRY</h3>
                <div className="value">{stats.totalKm.toLocaleString('cs-CZ')} km</div>
                <div className="description">celkem tento měsíc</div>
              </div>
            </div>

            {/* Finanční souhrn */}
            <div className="financial-summary">
              <h2>Finanční přehled</h2>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="label">Celková částka k fakturaci:</span>
                  <span className="value">{parseFloat(stats.totalAmount).toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="summary-item">
                  <span className="label">Již vyfakturováno ({stats.invoicedCount} organizací):</span>
                  <span className="value success">{parseFloat(stats.totalInvoiced).toLocaleString('cs-CZ')} Kč</span>
                </div>
                <div className="summary-item">
                  <span className="label">Zbývá vyfakturovat ({stats.pendingCount} organizací):</span>
                  <span className="value warning">{parseFloat(stats.totalPending).toLocaleString('cs-CZ')} Kč</span>
                </div>
              </div>
            </div>

            {/* Detailní tabulka */}
            <div className="table-container">
              <div className="table-header">
                DETAILNÍ PŘEHLED ORGANIZACÍ
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Organizace</th>
                    <th style={{ textAlign: 'center' }}>Počet záznamů</th>
                    <th style={{ textAlign: 'center' }}>Hodiny</th>
                    <th style={{ textAlign: 'center' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Za hodiny</th>
                    <th style={{ textAlign: 'right' }}>Za km</th>
                    <th style={{ textAlign: 'right' }}>Celkem</th>
                    <th style={{ textAlign: 'center' }}>Stav faktury</th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((org) => (
                    <tr key={org.organization.id}>
                      <td>
                        <strong>{org.organization.name}</strong>
                        <br />
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                          Kód: {org.organization.code}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{org.recordsCount}</td>
                      <td style={{ textAlign: 'center' }}>{org.totalHours}</td>
                      <td style={{ textAlign: 'center' }}>{org.totalKm.toLocaleString('cs-CZ')}</td>
                      <td style={{ textAlign: 'right' }}>{parseFloat(org.hourlyAmount).toLocaleString('cs-CZ')} Kč</td>
                      <td style={{ textAlign: 'right' }}>{parseFloat(org.kmAmount).toLocaleString('cs-CZ')} Kč</td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        {parseFloat(org.totalAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {org.invoice ? (
                          <span className={`status-badge status-${org.invoice.status.toLowerCase()}`}>
                            {org.invoice.status === 'DRAFT' && 'Koncept'}
                            {org.invoice.status === 'SENT' && 'Odesláno'}
                            {org.invoice.status === 'PAID' && 'Zaplaceno'}
                            {org.invoice.status === 'CANCELLED' && 'Zrušeno'}
                            <br />
                            <small>{org.invoice.invoiceNumber}</small>
                          </span>
                        ) : (
                          <span className="status-badge status-pending">Nevyfakturováno</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td><strong>CELKEM</strong></td>
                    <td style={{ textAlign: 'center' }}><strong>{stats.totalRecords}</strong></td>
                    <td style={{ textAlign: 'center' }}><strong>{stats.totalHours}</strong></td>
                    <td style={{ textAlign: 'center' }}><strong>{stats.totalKm.toLocaleString('cs-CZ')}</strong></td>
                    <td colSpan={2}></td>
                    <td style={{ textAlign: 'right' }}>
                      <strong>{parseFloat(stats.totalAmount).toLocaleString('cs-CZ')} Kč</strong>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Poznámka pro tisk */}
            <div className="print-footer">
              <p>Vygenerováno: {new Date().toLocaleDateString('cs-CZ')} {new Date().toLocaleTimeString('cs-CZ')}</p>
              <p>Fakturace System - Měsíční report {monthName}</p>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .loading-state {
          padding: 40px;
          text-align: center;
          color: var(--text-secondary);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .stat-card {
          background: var(--white);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 20px;
          text-align: center;
        }

        .stat-card h3 {
          margin: 0;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-card .value {
          font-size: 32px;
          font-weight: bold;
          color: var(--primary-green);
          margin: 10px 0;
        }

        .stat-card .description {
          font-size: 14px;
          color: var(--text-secondary);
        }

        .financial-summary {
          background: var(--summary-section);
          border: 1px solid #FFB74D;
          border-radius: 8px;
          padding: 30px;
          margin-bottom: 30px;
        }

        .financial-summary h2 {
          margin-top: 0;
          margin-bottom: 20px;
        }

        .summary-grid {
          display: grid;
          gap: 15px;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #FFE0B2;
        }

        .summary-item:last-child {
          border-bottom: none;
        }

        .summary-item .label {
          font-size: 16px;
          color: var(--text-primary);
        }

        .summary-item .value {
          font-size: 20px;
          font-weight: bold;
        }

        .summary-item .value.success {
          color: var(--status-success);
        }

        .summary-item .value.warning {
          color: var(--status-warning);
        }

        table tfoot {
          background: var(--total-row);
          font-weight: bold;
        }

        table tfoot td {
          padding: 15px 10px;
          border-top: 2px solid var(--border-color);
        }

        .status-badge small {
          font-size: 10px;
          font-weight: normal;
        }

        .print-footer {
          display: none;
          margin-top: 50px;
          padding-top: 20px;
          border-top: 1px solid var(--border-color);
          text-align: center;
          color: var(--text-secondary);
        }

        @media print {
          .no-print {
            display: none !important;
          }

          .print-footer {
            display: block;
          }

          .container {
            max-width: 100%;
            padding: 20px;
          }

          .stat-card {
            break-inside: avoid;
          }

          table {
            font-size: 12px;
          }
        }
      `}</style>
    </Layout>
  );
}