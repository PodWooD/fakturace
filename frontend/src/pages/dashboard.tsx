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

interface AvailableMonth {
  month: number;
  year: number;
  recordsCount: number;
  label: string;
  monthName: string;
}

interface OrganizationSummary {
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

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [summary, setSummary] = useState<OrganizationSummary[]>([]);
  const [totalStats, setTotalStats] = useState({
    organizations: 0,
    toBill: 0,
    totalAmount: '0',
    totalHours: '0',
    totalKm: 0
  });

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
    fetchAvailableMonths(token);
  }, [router]);

  useEffect(() => {
    if (user && selectedMonth && selectedYear) {
      fetchMonthSummary();
    }
  }, [selectedMonth, selectedYear, user]);

  const fetchAvailableMonths = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/work-records/available-months`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAvailableMonths(data);
        
        // Nastav aktuální měsíc pokud existuje v datech
        if (data.length > 0) {
          const currentMonth = new Date().getMonth() + 1;
          const currentYear = new Date().getFullYear();
          const hasCurrentMonth = data.some((m: AvailableMonth) => 
            m.month === currentMonth && m.year === currentYear
          );
          
          if (!hasCurrentMonth) {
            // Použij nejnovější měsíc
            setSelectedMonth(data[0].month);
            setSelectedYear(data[0].year);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching available months:', error);
    }
  };

  const fetchMonthSummary = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

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
        setSummary(data);
        
        // Spočítej celkové statistiky
        const stats = data.reduce((acc: any, item: OrganizationSummary) => {
          acc.organizations += 1;
          acc.totalAmount += parseFloat(item.totalAmount);
          acc.totalHours += parseFloat(item.totalHours);
          acc.totalKm += item.totalKm;
          return acc;
        }, {
          organizations: 0,
          totalAmount: 0,
          totalHours: 0,
          totalKm: 0
        });
        
        // Spočítej kolik organizací nemá fakturu
        const toBill = data.filter((item: OrganizationSummary) => !item.invoice).length;
        
        setTotalStats({
          organizations: stats.organizations,
          toBill: toBill,
          totalAmount: stats.totalAmount.toFixed(2),
          totalHours: stats.totalHours.toFixed(2),
          totalKm: stats.totalKm
        });
      }
    } catch (error) {
      console.error('Error fetching month summary:', error);
    }
  };

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const [month, year] = e.target.value.split('/').map(Number);
    setSelectedMonth(month);
    setSelectedYear(year);
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Načítání...</p>
        </div>
      </div>
    );
  }

  const selectedMonthName = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('cs-CZ', { 
    month: 'long', 
    year: 'numeric' 
  });

  return (
    <Layout user={user}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1>Dashboard - {selectedMonthName}</h1>
          
          {/* Výběr měsíce */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label htmlFor="month-select" style={{ fontWeight: '500' }}>Měsíc:</label>
            <select 
              id="month-select"
              value={`${selectedMonth}/${selectedYear}`}
              onChange={handleMonthChange}
              style={{
                padding: '8px 12px',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                backgroundColor: 'var(--bg-secondary)',
                cursor: 'pointer',
                fontSize: '16px'
              }}
            >
              {availableMonths.map((month) => (
                <option key={`${month.month}/${month.year}`} value={`${month.month}/${month.year}`}>
                  {month.monthName} ({month.recordsCount} záznamů)
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* Statistické karty */}
        <div className="dashboard-grid">
          <div className="stat-card">
            <h3>AKTIVNÍ ORGANIZACE</h3>
            <div className="value">{totalStats.organizations}</div>
            <div className="description">s daty v tomto měsíci</div>
          </div>
          <div className="stat-card orange">
            <h3>ZBÝVÁ VYFAKTUROVAT</h3>
            <div className="value">{totalStats.toBill}</div>
            <div className="description">organizace tento měsíc</div>
          </div>
          <div className="stat-card blue">
            <h3>TENTO MĚSÍC</h3>
            <div className="value">{parseFloat(totalStats.totalAmount).toLocaleString('cs-CZ')} Kč</div>
            <div className="description">předpokládaná fakturace</div>
          </div>
          <div className="stat-card red">
            <h3>ODPRACOVÁNO</h3>
            <div className="value">{totalStats.totalHours} h</div>
            <div className="description">hodin tento měsíc</div>
          </div>
        </div>
        
        {/* Rychlé akce a upozornění grid */}
        <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
          <div className="quick-actions">
            <h2>RYCHLÉ AKCE</h2>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <Link href="/import" className="btn btn-primary no-print">
                📊 Import dat z Excelu
              </Link>
              <Link href="/invoices/new" className="btn btn-secondary no-print">
                Vygenerovat faktury
              </Link>
              <Link href="/export" className="btn btn-warning no-print">
                Export do Pohoda XML
              </Link>
              <Link href="/reports" className="btn btn-outline no-print">
                Měsíční report
              </Link>
            </div>
          </div>
          
          <div className="quick-actions" style={{ backgroundColor: 'var(--info-box)', border: '1px solid #FFCC80' }}>
            <h2 style={{ color: 'var(--status-warning)' }}>⚠️ UPOZORNĚNÍ</h2>
            <ul style={{ margin: '10px 0', paddingLeft: '20px', listStyle: 'none' }}>
              <li style={{ marginBottom: '10px' }}>
                <span style={{ color: 'var(--status-error)', marginRight: '8px' }}>•</span>
                {totalStats.toBill} organizací nemá vytvořené faktury pro tento měsíc
              </li>
              <li style={{ marginBottom: '10px' }}>
                <span style={{ color: 'var(--status-warning)', marginRight: '8px' }}>•</span>
                Nezapomeňte importovat data z Excelu před vytvořením faktur
              </li>
              <li>
                <span style={{ color: 'var(--primary-blue)', marginRight: '8px' }}>•</span>
                Ujeto celkem {totalStats.totalKm} km tento měsíc
              </li>
            </ul>
          </div>
        </div>
        
        {/* Přehled v tabulce */}
        <div className="table-container">
          <div className="table-header">
            MĚSÍČNÍ PŘEHLED ORGANIZACÍ
          </div>
          <table>
            <thead>
              <tr>
                <th>Organizace</th>
                <th style={{ textAlign: 'center' }}>Počet záznamů</th>
                <th style={{ textAlign: 'center' }}>Odpracované hodiny</th>
                <th style={{ textAlign: 'center' }}>Ujeté km</th>
                <th style={{ textAlign: 'right' }}>Za hodiny</th>
                <th style={{ textAlign: 'right' }}>Za km</th>
                <th style={{ textAlign: 'right' }}>Celkem</th>
                <th style={{ textAlign: 'center' }}>Stav faktury</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((org) => (
                <tr key={org.organization.id}>
                  <td style={{ fontWeight: '500' }}>{org.organization.name}</td>
                  <td style={{ textAlign: 'center' }}>{org.recordsCount}</td>
                  <td style={{ textAlign: 'center' }}>{org.totalHours}</td>
                  <td style={{ textAlign: 'center' }}>{org.totalKm}</td>
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
                      </span>
                    ) : (
                      <span className="status-badge status-pending">Nevyfakturováno</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total-row">
                <td>CELKEM</td>
                <td style={{ textAlign: 'center' }}>
                  {summary.reduce((sum, org) => sum + org.recordsCount, 0)}
                </td>
                <td style={{ textAlign: 'center' }}>{totalStats.totalHours}</td>
                <td style={{ textAlign: 'center' }}>{totalStats.totalKm}</td>
                <td style={{ textAlign: 'right' }}>
                  {summary.reduce((sum, org) => sum + parseFloat(org.hourlyAmount), 0).toLocaleString('cs-CZ')} Kč
                </td>
                <td style={{ textAlign: 'right' }}>
                  {summary.reduce((sum, org) => sum + parseFloat(org.kmAmount), 0).toLocaleString('cs-CZ')} Kč
                </td>
                <td style={{ textAlign: 'right', fontSize: '18px' }}>
                  {parseFloat(totalStats.totalAmount).toLocaleString('cs-CZ')} Kč
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Roční statistiky */}
        <div className="table-container">
          <div className="section-header">
            ROČNÍ STATISTIKY {selectedYear}
          </div>
          <div style={{ padding: '20px' }}>
            <div className="dashboard-grid">
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--status-success)' }}>
                  {availableMonths.filter(m => m.year === selectedYear).length}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Měsíců s daty</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--primary-blue)' }}>
                  {availableMonths
                    .filter(m => m.year === selectedYear)
                    .reduce((sum, m) => sum + m.recordsCount, 0)}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Celkem záznamů</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#9C27B0' }}>
                  {totalStats.organizations}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Aktivních organizací</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--status-warning)' }}>
                  {selectedMonth}/{selectedYear}
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Vybraný měsíc</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}