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

interface Organization {
  id: number;
  name: string;
  code: string;
  ico: string;
  dic: string;
  address: string;
  email: string;
  phone: string;
  hourlyRate?: string;
  kmRate?: string;
}

interface InvoicePreview {
  organization: Organization;
  month: number;
  year: number;
  workRecords: any[];
  services: any[];
  hardware: any[];
  summary: {
    workAmount: string;
    servicesAmount: string;
    hardwareAmount: string;
    totalAmount: string;
    totalVat: string;
    totalWithVat: string;
  };
}

export default function NewInvoice() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [formData, setFormData] = useState({
    organizationId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });
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
    
    fetchOrganizations(token);
  }, [router]);

  const fetchOrganizations = async (token: string) => {
    try {
      const response = await fetch(`${API_URL}/api/organizations`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setOrganizations(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
      setError('Nepodařilo se načíst seznam organizací');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async () => {
    if (!formData.organizationId) {
      setError('Vyberte prosím organizaci');
      return;
    }

    setLoading(true);
    setError('');
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/api/invoices/preview`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const data = await response.json();
        setPreview(data);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Nepodařilo se načíst náhled faktury');
      }
    } catch (error) {
      console.error('Error fetching preview:', error);
      setError('Chyba při načítání náhledu faktury');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!formData.organizationId) {
      setError('Vyberte prosím organizaci');
      return;
    }

    setSaving(true);
    setError('');
    const token = localStorage.getItem('token');

    try {
      const response = await fetch(`${API_URL}/api/invoices/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        const invoice = await response.json();
        router.push(`/invoices/${invoice.id}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Nepodařilo se vytvořit fakturu');
      }
    } catch (error) {
      console.error('Error generating invoice:', error);
      setError('Chyba při vytváření faktury');
    } finally {
      setSaving(false);
    }
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setPreview(null); // Reset preview při změně
  };

  if (!user) {
    return null;
  }

  return (
    <Layout user={user}>
      <div className="container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <h1>Nová faktura</h1>
          <Link href="/invoices" className="btn btn-outline">
            ← Zpět na seznam
          </Link>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="form-section">
          <h2>Základní údaje</h2>
          
          <div className="form-row">
            <div className="form-group">
              <label>Organizace *</label>
              <select
                value={formData.organizationId}
                onChange={(e) => handleFormChange('organizationId', e.target.value)}
                disabled={loading}
              >
                <option value="">-- Vyberte organizaci --</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Měsíc *</label>
              <select
                value={formData.month}
                onChange={(e) => handleFormChange('month', parseInt(e.target.value))}
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2024, i).toLocaleDateString('cs-CZ', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Rok *</label>
              <select
                value={formData.year}
                onChange={(e) => handleFormChange('year', parseInt(e.target.value))}
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-actions">
            <button 
              className="btn btn-primary"
              onClick={handlePreview}
              disabled={!formData.organizationId || loading}
            >
              Zobrazit náhled
            </button>
          </div>
        </div>

        {preview && (
          <>
            <div className="preview-section">
              <h2>Náhled faktury</h2>
              
              <div className="preview-header">
                <div>
                  <h3>{preview.organization.name}</h3>
                  <p>{preview.organization.address}</p>
                  <p>IČO: {preview.organization.ico || 'Nevyplněno'}</p>
                  <p>DIČ: {preview.organization.dic || 'Nevyplněno'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p>Období: {preview.month}/{preview.year}</p>
                  <p>Počet výkazů: {preview.workRecords.length}</p>
                </div>
              </div>

              {preview.workRecords.length > 0 && (
                <div className="preview-section-detail">
                  <h3>Výkazy práce</h3>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Pracovník</th>
                        <th>Popis</th>
                        <th style={{ textAlign: 'center' }}>Hodiny</th>
                        <th style={{ textAlign: 'center' }}>Km</th>
                        <th style={{ textAlign: 'right' }}>Částka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.workRecords.slice(0, 5).map((record, idx) => (
                        <tr key={idx}>
                          <td>{new Date(record.date).toLocaleDateString('cs-CZ')}</td>
                          <td>{record.worker}</td>
                          <td>{record.description}</td>
                          <td style={{ textAlign: 'center' }}>{(record.minutes / 60).toFixed(2)}</td>
                          <td style={{ textAlign: 'center' }}>{record.kilometers}</td>
                          <td style={{ textAlign: 'right' }}>
                            {((record.minutes / 60 * parseFloat(preview.organization.hourlyRate || '0')) + 
                              (record.kilometers * parseFloat(preview.organization.kmRate || '0'))).toLocaleString('cs-CZ')} Kč
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.workRecords.length > 5 && (
                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      ... a dalších {preview.workRecords.length - 5} záznamů
                    </p>
                  )}
                </div>
              )}

              {preview.services.length > 0 && (
                <div className="preview-section-detail">
                  <h3>Pravidelné služby</h3>
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Služba</th>
                        <th>Popis</th>
                        <th style={{ textAlign: 'right' }}>Měsíční částka</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.services.map((service, idx) => (
                        <tr key={idx}>
                          <td>{service.serviceName}</td>
                          <td>{service.description}</td>
                          <td style={{ textAlign: 'right' }}>
                            {parseFloat(service.monthlyPrice).toLocaleString('cs-CZ')} Kč
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="preview-summary">
                <h3>Souhrn</h3>
                <table className="summary-table">
                  <tbody>
                    <tr>
                      <td>Práce a výjezdy:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.workAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                    <tr>
                      <td>Pravidelné služby:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.servicesAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                    <tr>
                      <td>Hardware:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.hardwareAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                    <tr className="summary-separator">
                      <td>Celkem bez DPH:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.totalAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                    <tr>
                      <td>DPH 21%:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.totalVat).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                    <tr className="summary-total">
                      <td>Celkem s DPH:</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(preview.summary.totalWithVat).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="form-actions" style={{ marginTop: '30px' }}>
                <button
                  className="btn btn-success"
                  onClick={handleGenerate}
                  disabled={saving}
                >
                  {saving ? 'Vytváření...' : 'Vytvořit fakturu'}
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => setPreview(null)}
                >
                  Zrušit náhled
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <style jsx>{`
        .error-message {
          background: #FEE;
          border: 1px solid #FCC;
          color: #C00;
          padding: 15px;
          border-radius: 8px;
          margin-bottom: 20px;
        }

        .form-section {
          background: var(--white);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 30px;
          margin-bottom: 30px;
        }

        .form-section h2 {
          margin-top: 0;
          margin-bottom: 20px;
        }

        .form-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          margin-bottom: 20px;
        }

        .form-group label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: var(--text-secondary);
        }

        .form-group select,
        .form-group input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
        }

        .form-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-start;
        }

        .preview-section {
          background: var(--white);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 30px;
        }

        .preview-header {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 30px;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-color);
        }

        .preview-header h3 {
          margin-top: 0;
          margin-bottom: 10px;
        }

        .preview-header p {
          margin: 5px 0;
          color: var(--text-secondary);
        }

        .preview-section-detail {
          margin-bottom: 30px;
        }

        .preview-section-detail h3 {
          margin-bottom: 15px;
        }

        .preview-table {
          width: 100%;
          font-size: 14px;
        }

        .preview-table th {
          background: var(--section-header);
          padding: 10px;
          text-align: left;
        }

        .preview-table td {
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-color);
        }

        .preview-summary {
          background: var(--summary-section);
          padding: 20px;
          border-radius: 8px;
        }

        .summary-table {
          width: 100%;
          max-width: 400px;
          margin-left: auto;
        }

        .summary-table td {
          padding: 8px 0;
        }

        .summary-separator td {
          border-top: 1px solid var(--border-color);
          padding-top: 15px;
        }

        .summary-total td {
          font-size: 18px;
          font-weight: bold;
          padding-top: 15px;
        }

        .btn-success {
          background-color: var(--status-success);
          color: white;
        }

        .btn-success:hover {
          opacity: 0.9;
        }
      `}</style>
    </Layout>
  );
}