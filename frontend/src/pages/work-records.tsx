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

interface WorkRecord {
  id: number;
  date: string;
  worker: string;
  description: string;
  minutes: number;
  hours: string;
  kilometers: number;
  organization: {
    id: number;
    name: string;
    code: string;
    hourlyRate: string;
    kmRate: string;
  };
  billingOrg?: {
    id: number;
    name: string;
    code: string;
  };
  projectCode?: string;
  hourlyAmount: string;
  kmAmount: string;
  totalAmount: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function WorkRecords() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 50,
    total: 0,
    pages: 0
  });
  const [filters, setFilters] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    organizationId: '',
    worker: ''
  });
  const [organizations, setOrganizations] = useState<any[]>([]);

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
    fetchWorkRecords(token);
  }, [router]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchWorkRecords(token);
    }
  }, [filters, pagination.page]);

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
    }
  };

  const fetchWorkRecords = async (token: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        month: filters.month.toString(),
        year: filters.year.toString()
      });
      
      if (filters.organizationId) {
        params.append('organizationId', filters.organizationId);
      }
      if (filters.worker) {
        params.append('worker', filters.worker);
      }

      const response = await fetch(`${API_URL}/api/work-records?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRecords(data.data || []);
        setPagination(data.pagination || pagination);
      } else {
        console.error('Failed to fetch work records');
      }
    } catch (error) {
      console.error('Error fetching work records:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (field: string, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset na první stránku při změně filtru
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('cs-CZ');
  };

  if (!user) {
    return null;
  }

  return (
    <Layout user={user}>
      <div className="container">
        <h1>Výkazy práce</h1>
        
        {/* Filtry */}
        <div className="filter-section">
          <div className="filter-row">
            <div className="filter-item">
              <label>Měsíc:</label>
              <select 
                value={filters.month}
                onChange={(e) => handleFilterChange('month', parseInt(e.target.value))}
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
                onChange={(e) => handleFilterChange('year', parseInt(e.target.value))}
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            
            <div className="filter-item">
              <label>Organizace:</label>
              <select 
                value={filters.organizationId}
                onChange={(e) => handleFilterChange('organizationId', e.target.value)}
              >
                <option value="">Všechny organizace</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="filter-item">
              <label>Pracovník:</label>
              <input 
                type="text"
                placeholder="Hledat podle jména..."
                value={filters.worker}
                onChange={(e) => handleFilterChange('worker', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Tabulka */}
        <div className="table-container">
          <div className="table-header">
            VÝKAZY PRÁCE - {filters.month}/{filters.year}
          </div>
          
          {loading ? (
            <div className="loading-state">Načítání dat...</div>
          ) : records.length === 0 ? (
            <div className="empty-state">
              Žádné záznamy nenalezeny pro zadané filtry.
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Pracovník</th>
                    <th>Organizace</th>
                    <th>Zakázka</th>
                    <th>Popis práce</th>
                    <th style={{ textAlign: 'center' }}>Hodiny</th>
                    <th style={{ textAlign: 'center' }}>Km</th>
                    <th style={{ textAlign: 'right' }}>Za hodiny</th>
                    <th style={{ textAlign: 'right' }}>Za km</th>
                    <th style={{ textAlign: 'right' }}>Celkem</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.id}>
                      <td>{formatDate(record.date)}</td>
                      <td>{record.worker}</td>
                      <td>
                        <span style={{ fontWeight: '500' }}>{record.organization.name}</span>
                        {record.billingOrg && record.billingOrg.id !== record.organization.id && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                            <br />→ Fakturuje: {record.billingOrg.name}
                          </span>
                        )}
                      </td>
                      <td>{record.projectCode || '-'}</td>
                      <td style={{ maxWidth: '300px' }}>{record.description}</td>
                      <td style={{ textAlign: 'center' }}>{record.hours}</td>
                      <td style={{ textAlign: 'center' }}>{record.kilometers}</td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(record.hourlyAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {parseFloat(record.kmAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                        {parseFloat(record.totalAmount).toLocaleString('cs-CZ')} Kč
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              
              {/* Paginace */}
              {pagination.pages > 1 && (
                <div className="pagination">
                  <button 
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page === 1}
                    className="btn btn-outline"
                  >
                    Předchozí
                  </button>
                  
                  <span className="pagination-info">
                    Strana {pagination.page} z {pagination.pages} 
                    (celkem {pagination.total} záznamů)
                  </span>
                  
                  <button 
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page === pagination.pages}
                    className="btn btn-outline"
                  >
                    Další
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <style jsx>{`
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
          flex-wrap: wrap;
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

        .filter-item select,
        .filter-item input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: 6px;
          font-size: 14px;
        }

        .loading-state,
        .empty-state {
          padding: 40px;
          text-align: center;
          color: var(--text-secondary);
        }

        .pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-top: 1px solid var(--border-color);
        }

        .pagination-info {
          color: var(--text-secondary);
        }

        table td:nth-child(5) {
          white-space: normal;
          line-height: 1.4;
        }
      `}</style>
    </Layout>
  );
}