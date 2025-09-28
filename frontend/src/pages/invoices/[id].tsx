import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { API_URL } from '../../config/api';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

interface ServiceItem {
  id: number;
  serviceName: string;
  description?: string;
  monthlyPrice: string | number;
  isActive: boolean;
}

interface WorkRecordItem {
  id: number;
  date: string;
  worker: string;
  description: string;
  minutes: number;
  kilometers: number;
  projectCode?: string | null;
}

interface HardwareItem {
  id: number;
  itemName: string;
  description?: string;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
  month: number;
  year: number;
}

interface OrganizationInfo {
  id: number;
  name: string;
  code?: string | null;
  contactPerson?: string | null;
  hourlyRate: string | number;
  kmRate: string | number;
  address?: string | null;
  ico?: string | null;
  dic?: string | null;
}

interface InvoiceDetailResponse {
  id: number;
  invoiceNumber: string;
  organizationId: number;
  organization: OrganizationInfo;
  month: number;
  year: number;
  totalAmount: string | number;
  totalVat: string | number;
  status: string;
  generatedAt: string;
  notes?: string | null;
  workRecords: WorkRecordItem[];
  services: ServiceItem[];
  hardware: HardwareItem[];
}

const formatCurrency = (value: number) => value.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' });

const formatMinutes = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
};

const formatDate = (date: string) => new Date(date).toLocaleDateString('cs-CZ');

export default function InvoiceDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceDetailResponse | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');

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

    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    const invoiceId = Array.isArray(id) ? id[0] : id;
    if (!authChecked || !user || !invoiceId) {
      return;
    }

    const fetchInvoice = async () => {
      setLoadingData(true);
      setError('');

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/api/invoices/${invoiceId}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Nepodařilo se načíst fakturu');
        }

        const data: InvoiceDetailResponse = await response.json();
        setInvoice(data);
      } catch (err: any) {
        setError(err.message || 'Chyba při načítání faktury');
      } finally {
        setLoadingData(false);
      }
    };

    fetchInvoice();
  }, [authChecked, user, id]);

  const summary = useMemo(() => {
    if (!invoice) {
      return {
        totalMinutes: 0,
        totalKm: 0,
        workAmount: 0,
        kmAmount: 0,
        servicesAmount: 0,
        hardwareAmount: 0
      };
    }

    const hourlyRate = Number(invoice.organization.hourlyRate || 0);
    const kmRate = Number(invoice.organization.kmRate || 0);

    const totalMinutes = invoice.workRecords.reduce((sum, record) => sum + record.minutes, 0);
    const totalKm = invoice.workRecords.reduce((sum, record) => sum + record.kilometers, 0);
    const workAmount = invoice.workRecords.reduce((sum, record) => sum + (record.minutes / 60) * hourlyRate, 0);
    const kmAmount = totalKm * kmRate;
    const servicesAmount = invoice.services.reduce((sum, service) => sum + Number(service.monthlyPrice || 0), 0);
    const hardwareAmount = invoice.hardware.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

    return {
      totalMinutes,
      totalKm,
      workAmount,
      kmAmount,
      servicesAmount,
      hardwareAmount
    };
  }, [invoice]);

  if (!authChecked || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Načítání...</p>
        </div>
      </div>
    );
  }

  const invoiceMonthName = invoice
    ? new Date(invoice.year, invoice.month - 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })
    : '';

  return (
    <Layout user={user}>
      <div className="container">
        <div style={{ marginBottom: '30px' }}>
          <button
            onClick={() => router.back()}
            className="btn btn-outline no-print"
            style={{ marginBottom: '20px' }}
          >
            ← Zpět na seznam faktur
          </button>
          {invoice && (
            <h1>Faktura č. {invoice.invoiceNumber} – {invoiceMonthName}</h1>
          )}
        </div>

        {error && (
          <div className="info-box" style={{ backgroundColor: '#ffebee', borderColor: '#f44336' }}>
            {error}
          </div>
        )}

        {loadingData && (
          <div className="info-box">
            Načítám fakturu...
          </div>
        )}

        {!loadingData && invoice && (
          <div className="sheet-preview">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td colSpan={6} className="client-info">
                    {invoice.organization.name}
                    {invoice.organization.contactPerson && ` (${invoice.organization.contactPerson})`}
                  </td>
                </tr>

                <tr>
                  <td colSpan={6} className="h-4"></td>
                </tr>

                <tr>
                  <td colSpan={6} className="section-header">CENOVÉ PODMÍNKY</td>
                </tr>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Položka</th>
                  <th colSpan={3} style={{ padding: '8px', textAlign: 'left' }}>Popis</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Cena</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Jednotka</th>
                </tr>
                <tr>
                  <td>Hodinová sazba</td>
                  <td colSpan={3}>Práce IT technika nad rámec paušálu</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{Number(invoice.organization.hourlyRate || 0).toLocaleString('cs-CZ')} Kč</td>
                  <td>Kč/hod</td>
                </tr>
                <tr>
                  <td>Cestovné</td>
                  <td colSpan={3}>Náhrada za ujeté kilometry</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{Number(invoice.organization.kmRate || 0).toLocaleString('cs-CZ')} Kč</td>
                  <td>Kč/km</td>
                </tr>

                <tr>
                  <td colSpan={6} className="h-4"></td>
                </tr>

                <tr>
                  <td colSpan={6} className="section-header">PAUŠÁLNÍ SLUŽBY</td>
                </tr>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Služba</th>
                  <th colSpan={3} style={{ padding: '8px', textAlign: 'left' }}>Popis</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Měsíční cena</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Poznámka</th>
                </tr>
                {invoice.services.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '15px', fontStyle: 'italic' }}>
                      Žádné paušální služby nejsou nastaveny.
                    </td>
                  </tr>
                )}
                {invoice.services.map((service) => (
                  <tr key={service.id}>
                    <td>{service.serviceName}</td>
                    <td colSpan={3}>{service.description || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(Number(service.monthlyPrice || 0))}</td>
                    <td>Kč/měsíc</td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={6} className="h-4"></td>
                </tr>

                <tr>
                  <td colSpan={6} className="section-header">
                    PRÁCE IT TECHNIKA – {invoiceMonthName.toUpperCase()}
                  </td>
                </tr>
                <tr>
                  <th style={{ padding: '8px', textAlign: 'left', width: '100px' }}>Datum</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Pracovník</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Popis práce</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Hodiny</th>
                  <th style={{ padding: '8px', textAlign: 'center', width: '60px' }}>Km</th>
                  <th style={{ padding: '8px', textAlign: 'right', width: '120px' }}>Odhad ceny</th>
                </tr>
                {invoice.workRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '15px', fontStyle: 'italic' }}>
                      V tomto období nejsou žádné pracovní záznamy.
                    </td>
                  </tr>
                )}
                {invoice.workRecords.map((record) => (
                  <tr key={record.id}>
                    <td style={{ fontSize: '13px' }}>{formatDate(record.date)}</td>
                    <td>{record.worker}</td>
                    <td>{record.description}</td>
                    <td style={{ textAlign: 'center' }}>{formatMinutes(record.minutes)}</td>
                    <td style={{ textAlign: 'center' }}>{record.kilometers}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatCurrency(((record.minutes / 60) * Number(invoice.organization.hourlyRate || 0)) + (record.kilometers * Number(invoice.organization.kmRate || 0)))}
                    </td>
                  </tr>
                ))}
                <tr className="summary-section">
                  <td colSpan={3} style={{ fontWeight: 'bold' }}>Celkem práce nad rámec</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{formatMinutes(summary.totalMinutes)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{summary.totalKm}</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(summary.workAmount + summary.kmAmount)}</td>
                </tr>

                <tr>
                  <td colSpan={6} className="h-4"></td>
                </tr>

                <tr>
                  <td colSpan={6} className="section-header">FAKTUROVANÝ HARDWARE</td>
                </tr>
                {invoice.hardware.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '15px', fontStyle: 'italic' }}>
                      Žádný hardware nebyl v tomto období fakturován.
                    </td>
                  </tr>
                )}
                {invoice.hardware.map((item) => (
                  <tr key={item.id}>
                    <td colSpan={2}>{item.itemName}</td>
                    <td colSpan={2}>{item.description || '—'}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity} ks</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(Number(item.totalPrice || 0))}</td>
                  </tr>
                ))}

                <tr>
                  <td colSpan={6} className="h-4"></td>
                </tr>

                <tr>
                  <td colSpan={6} className="section-header">SOUHRN ZA MĚSÍC</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '10px' }}>Paušální služby</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(summary.servicesAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '10px' }}>Práce a cestovné</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(summary.workAmount + summary.kmAmount)}</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '10px' }}>Hardware</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(summary.hardwareAmount)}</td>
                </tr>
                <tr className="total-row">
                  <td colSpan={4} style={{ padding: '12px', fontWeight: 'bold' }}>Celkem bez DPH</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(Number(invoice.totalAmount || 0))}</td>
                </tr>
                <tr>
                  <td colSpan={4} style={{ padding: '10px' }}>DPH (21 %)</td>
                  <td colSpan={2} style={{ textAlign: 'right' }}>{formatCurrency(Number(invoice.totalVat || 0))}</td>
                </tr>
                <tr className="summary-section">
                  <td colSpan={4} style={{ padding: '12px', fontWeight: 'bold' }}>Celkem s DPH</td>
                  <td colSpan={2} style={{ textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(Number(invoice.totalAmount || 0) + Number(invoice.totalVat || 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
