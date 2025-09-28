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

interface Organization {
  id: number;
  name: string;
  code: string;
  contactPerson: string;
  hourlyRate: string;
  kmRate: string;
  address?: string;
  ico?: string;
  dic?: string;
  email?: string;
  phone?: string;
  services?: any[];
}

export default function Organizations() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    contactPerson: '',
    hourlyRate: '',
    kmRate: '',
    address: '',
    ico: '',
    dic: '',
    email: '',
    phone: ''
  });
  const [stats, setStats] = useState({
    totalOrgs: 0,
    monthlyServices: 0,
    avgHourlyRate: 0
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
        console.log('API response:', data);
        const orgs = Array.isArray(data) ? data : (data.data || []);
        console.log('Organizations loaded:', orgs.length);
        setOrganizations(orgs);
        calculateStats(orgs);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (orgs: Organization[]) => {
    const totalOrgs = orgs.length;
    const avgHourlyRate = orgs.reduce((sum, org) => sum + parseFloat(org.hourlyRate || '0'), 0) / (totalOrgs || 1);
    // TODO: Calculate monthly services from actual services data
    setStats({
      totalOrgs,
      monthlyServices: 0,
      avgHourlyRate
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    try {
      const url = editingOrg 
        ? `${API_URL}/api/organizations/${editingOrg.id}`
        : `${API_URL}/api/organizations`;
      
      const response = await fetch(url, {
        method: editingOrg ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setShowModal(false);
        resetForm();
        fetchOrganizations(token!);
      }
    } catch (error) {
      console.error('Error saving organization:', error);
    }
  };

  const handleEdit = (org: Organization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      code: org.code,
      contactPerson: org.contactPerson || '',
      hourlyRate: org.hourlyRate,
      kmRate: org.kmRate,
      address: org.address || '',
      ico: org.ico || '',
      dic: org.dic || '',
      email: org.email || '',
      phone: org.phone || ''
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      code: '',
      contactPerson: '',
      hourlyRate: '',
      kmRate: '',
      address: '',
      ico: '',
      dic: '',
      email: '',
      phone: ''
    });
    setEditingOrg(null);
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
          <h1 className="text-2xl font-bold text-gray-800">Organizace</h1>
          <button 
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors">
            + Přidat organizaci
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
          <div className="bg-green-600 text-white px-4 py-3 font-bold">
            SEZNAM ORGANIZACÍ
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="text-left">Kód</th>
                <th className="text-left">Název organizace</th>
                <th className="text-left">Kontaktní osoba</th>
                <th className="text-center">Hodinová sazba</th>
                <th className="text-center">Sazba za km</th>
                <th className="text-center">Počet služeb</th>
                <th className="text-center">Akce</th>
              </tr>
            </thead>
            <tbody>
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td className="font-bold text-green-600">{org.code}</td>
                  <td className="font-medium">{org.name}</td>
                  <td>{org.contactPerson || '-'}</td>
                  <td className="text-center">{parseFloat(org.hourlyRate).toLocaleString('cs-CZ')} Kč/hod</td>
                  <td className="text-center">{parseFloat(org.kmRate).toLocaleString('cs-CZ')} Kč/km</td>
                  <td className="text-center">{org.services?.length || 0}</td>
                  <td className="text-center">
                    <button 
                      onClick={() => handleEdit(org)}
                      className="text-blue-600 hover:underline text-sm mr-2">Upravit</button>
                    <button className="text-green-600 hover:underline text-sm">Detail</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 font-bold">
              STATISTIKY
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-blue-600">{stats.totalOrgs}</p>
              <p className="text-sm text-gray-600">Celkem organizací</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
            <div className="bg-orange-100 px-4 py-3 font-bold">
              PAUŠÁLNÍ SLUŽBY
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-orange-600">{stats.monthlyServices.toLocaleString('cs-CZ')} Kč</p>
              <p className="text-sm text-gray-600">Měsíční příjem z paušálů</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
            <div className="bg-green-100 px-4 py-3 font-bold">
              PRŮMĚRNÁ SAZBA
            </div>
            <div className="p-4">
              <p className="text-2xl font-bold text-green-600">{Math.round(stats.avgHourlyRate)} Kč</p>
              <p className="text-sm text-gray-600">Za hodinu práce</p>
            </div>
          </div>
        </div>

        {/* Modal pro přidání/úpravu organizace */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-bold mb-4">
                {editingOrg ? 'Upravit organizaci' : 'Nová organizace'}
              </h2>
              
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Název organizace *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kód *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.code}
                      onChange={(e) => setFormData({...formData, code: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Kontaktní osoba
                    </label>
                    <input
                      type="text"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({...formData, contactPerson: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Hodinová sazba (Kč) *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.hourlyRate}
                      onChange={(e) => setFormData({...formData, hourlyRate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Sazba za km (Kč) *
                    </label>
                    <input
                      type="number"
                      required
                      value={formData.kmRate}
                      onChange={(e) => setFormData({...formData, kmRate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Adresa
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({...formData, address: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      IČO
                    </label>
                    <input
                      type="text"
                      value={formData.ico}
                      onChange={(e) => setFormData({...formData, ico: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      DIČ
                    </label>
                    <input
                      type="text"
                      value={formData.dic}
                      onChange={(e) => setFormData({...formData, dic: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    {editingOrg ? 'Uložit změny' : 'Vytvořit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}