import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';
import { API_URL } from '../config/api';

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
  hourlyRate: string;
  kmRate: string;
}

interface ServiceItem {
  id: number | null;
  serviceName: string;
  description: string | null;
  monthlyPrice: number;
  isActive?: boolean;
}

interface WorkEntry {
  id: number | null;
  date: string | null;
  worker: string | null;
  description: string | null;
  minutes: number;
  hours: number;
  kilometers: number;
  hourlyAmount: number;
  kmAmount: number;
  projectCode?: string | null;
  branch?: string | null;
  timeFrom?: string | null;
  timeTo?: string | null;
}

interface InventoryItem {
  id: number | null;
  itemName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status?: string;
  invoiceNumber?: string | null;
  supplier?: string | null;
  sourceInvoiceItemId?: number | null;
}

interface BillingBaseResponse {
  organization: {
    id: number;
    name: string;
    code?: string;
    hourlyRate: number;
    kmRate: number;
  };
  period: {
    month: number;
    year: number;
  };
  services: ServiceItem[];
  work: {
    entries: WorkEntry[];
    summary: {
      totalMinutes: number;
      totalHours: number;
      totalKm: number;
      hourlyAmount: number;
      kmAmount: number;
    };
  };
  hardware: InventoryItem[];
  software: InventoryItem[];
  totals: {
    workAmount: number;
    kmAmount: number;
    servicesAmount: number;
    hardwareAmount: number;
    totalAmount: number;
    totalVat: number;
    totalWithVat: number;
  };
}

interface BillingSummaryPayload {
  base: BillingBaseResponse;
  draft: {
    data: BillingDraftData | null;
    updatedAt: string;
    updatedBy: number | null;
  } | null;
}

interface BillingDraftData {
  rates: {
    hourlyRate: string;
    kmRate: string;
    extraHourlyRate: string;
    extraKmRate: string;
  };
  services: ServiceItem[];
  work: {
    entries: WorkEntry[];
    notes: string;
  };
  hardware: InventoryItem[];
  software: InventoryItem[];
  totalsOverride?: {
    totalAmount?: number;
    totalVat?: number;
    totalWithVat?: number;
  } | null;
  notes?: string;
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

const monthOptions = Array.from({ length: 12 }).map((_, idx) => ({
  value: idx + 1,
  label: new Date(2024, idx).toLocaleDateString('cs-CZ', { month: 'long' })
}));

const toNumber = (value: any, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildDraftFromBase = (base: BillingBaseResponse): BillingDraftData => ({
  rates: {
    hourlyRate: base.organization.hourlyRate.toString(),
    kmRate: base.organization.kmRate.toString(),
    extraHourlyRate: '',
    extraKmRate: ''
  },
  services: base.services.map((service) => ({
    id: service.id,
    serviceName: service.serviceName,
    description: service.description,
    monthlyPrice: service.monthlyPrice,
    isActive: service.isActive
  })),
  work: {
    entries: base.work.entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      worker: entry.worker,
      description: entry.description,
      minutes: entry.minutes,
      hours: entry.hours,
      kilometers: entry.kilometers,
      hourlyAmount: entry.hourlyAmount,
      kmAmount: entry.kmAmount,
      projectCode: entry.projectCode,
      branch: entry.branch,
      timeFrom: entry.timeFrom,
      timeTo: entry.timeTo
    })),
    notes: ''
  },
  hardware: base.hardware.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    description: item.description,
    quantity: item.quantity ?? 1,
    unitPrice: item.unitPrice ?? 0,
    totalPrice: item.totalPrice ?? 0,
    status: item.status,
    invoiceNumber: item.invoiceNumber || null,
    supplier: item.supplier || null,
    sourceInvoiceItemId: item.sourceInvoiceItemId || null
  })),
  software: base.software?.map((item) => ({
    id: item.id,
    itemName: item.itemName,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice
  })) || [],
  totalsOverride: null,
  notes: ''
});

const computeDraftTotals = (draft: BillingDraftData, baseTotals: BillingBaseResponse['totals']) => {
  const servicesAmount = draft.services.reduce((sum, service) => sum + toNumber(service.monthlyPrice), 0);
  const workHourly = draft.work.entries.reduce((sum, entry) => sum + toNumber(entry.hourlyAmount), 0);
  const workKm = draft.work.entries.reduce((sum, entry) => sum + toNumber(entry.kmAmount), 0);
  const hardwareAmount = draft.hardware.reduce((sum, item) => sum + toNumber(item.totalPrice), 0);
  const softwareAmount = draft.software.reduce((sum, item) => sum + toNumber(item.totalPrice), 0);

  const totalAmount = servicesAmount + workHourly + workKm + hardwareAmount + softwareAmount;
  const vatRatio = baseTotals.totalAmount > 0 ? baseTotals.totalVat / baseTotals.totalAmount : 0.21;
  const totalVat = totalAmount * vatRatio;
  const totalWithVat = totalAmount + totalVat;

  return {
    servicesAmount: Number(servicesAmount.toFixed(2)),
    workAmount: Number(workHourly.toFixed(2)),
    kmAmount: Number(workKm.toFixed(2)),
    hardwareAmount: Number((hardwareAmount + softwareAmount).toFixed(2)),
    totalAmount: Number(totalAmount.toFixed(2)),
    totalVat: Number(totalVat.toFixed(2)),
    totalWithVat: Number(totalWithVat.toFixed(2))
  };
};

const FakturacePage: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [baseData, setBaseData] = useState<BillingBaseResponse | null>(null);
  const [draftData, setDraftData] = useState<BillingDraftData | null>(null);
  const [draftMeta, setDraftMeta] = useState<{ updatedAt: string; updatedBy: number | null } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [availableHardware, setAvailableHardware] = useState<any[]>([]);
  const [hardwareLoading, setHardwareLoading] = useState<boolean>(false);
  const [hardwareError, setHardwareError] = useState<string>('');

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

    const fetchOrganizations = async () => {
      try {
        const response = await fetch(`${API_URL}/api/organizations`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error('Chyba při načítání organizací');
        }

        const payload = await response.json();
        const data = Array.isArray(payload) ? payload : payload.data;
        setOrganizations(data || []);
        if (data && data.length > 0) {
          setSelectedOrganizationId(data[0].id);
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchOrganizations();
  }, [router]);

  useEffect(() => {
    if (!selectedOrganizationId) return;

    const fetchSummary = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      setLoading(true);
      setErrorMessage('');
      try {
        const params = new URLSearchParams({
          organizationId: String(selectedOrganizationId),
          month: String(selectedMonth),
          year: String(selectedYear)
        });

        const response = await fetch(`${API_URL}/api/billing/summary?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || 'Chyba při načítání fakturačních dat');
        }

        const payload: BillingSummaryPayload = await response.json();
        setBaseData(payload.base);
        setDraftMeta(payload.draft ? { updatedAt: payload.draft.updatedAt, updatedBy: payload.draft.updatedBy } : null);

        const draft = payload.draft?.data;
        if (draft) {
          setDraftData(draft);
        } else {
          setDraftData(buildDraftFromBase(payload.base));
        }
        setIsDirty(false);
      } catch (error: any) {
        console.error(error);
        setErrorMessage(error.message || 'Nepodařilo se načíst data');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [selectedOrganizationId, selectedMonth, selectedYear]);

  const computedTotals = useMemo(() => {
    if (!draftData || !baseData) return null;
    return computeDraftTotals(draftData, baseData.totals);
  }, [draftData, baseData]);

  const markDirty = () => {
    setIsDirty(true);
    setSaveState('idle');
  };

  const updateDraft = (updater: (prev: BillingDraftData) => BillingDraftData) => {
    setDraftData((prev) => {
      if (!prev) return prev;
      const updated = updater(prev);
      return { ...updated };
    });
    markDirty();
  };

  const handleRateChange = (field: 'hourlyRate' | 'kmRate' | 'extraHourlyRate' | 'extraKmRate', value: string) => {
    updateDraft((prev) => ({
      ...prev,
      rates: {
        ...prev.rates,
        [field]: value
      }
    }));
  };

  const fetchAvailableHardware = async () => {
    if (!selectedOrganizationId) {
      setHardwareError('Vyberte nejprve organizaci.');
      return;
    }
    setHardwareLoading(true);
    setHardwareError('');
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams({
        organizationId: String(selectedOrganizationId),
        status: 'ASSIGNED',
        month: String(selectedMonth),
        year: String(selectedYear)
      });
      const response = await fetch(`${API_URL}/api/hardware?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Nepodařilo se načíst hardware');
      }
      const data = await response.json();
      setAvailableHardware(data.data || []);
    } catch (err: any) {
      setHardwareError(err.message || 'Chyba při načítání hardware');
    } finally {
      setHardwareLoading(false);
    }
  };

  const handleAddHardwareFromPool = async (hardwareItem: any) => {
    if (!draftData) return;
    try {
      setHardwareError('');
      updateDraft((prev) => ({
        ...prev,
        hardware: [
          ...prev.hardware,
          {
            id: hardwareItem.id,
            itemName: hardwareItem.itemName,
            description: hardwareItem.description,
            quantity: hardwareItem.quantity ?? 1,
            unitPrice: Number(hardwareItem.unitPrice || 0),
            totalPrice: Number(hardwareItem.totalPrice || 0),
            status: 'INVOICED',
            invoiceNumber: hardwareItem.invoiceItem?.invoice?.invoiceNumber || hardwareItem.invoiceNumber || null,
            supplier: hardwareItem.invoiceItem?.invoice?.supplierName || hardwareItem.supplier || null,
            sourceInvoiceItemId: hardwareItem.sourceInvoiceItemId || null
          }
        ]
      }));

      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/hardware/${hardwareItem.id}/mark-invoiced`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      setAvailableHardware((prev) => prev.filter((item) => item.id !== hardwareItem.id));
      setIsDirty(true);
    } catch (err: any) {
      setHardwareError(err.message || 'Nepodařilo se označit hardware jako vyfakturovaný');
    }
  };

  const handleServiceChange = (index: number, field: keyof ServiceItem, value: string) => {
    updateDraft((prev) => {
      const services = [...prev.services];
      services[index] = {
        ...services[index],
        [field]: field === 'monthlyPrice' ? toNumber(value) : value
      } as ServiceItem;
      return { ...prev, services };
    });
  };

  const handleWorkEntryChange = (index: number, field: keyof WorkEntry, value: string) => {
    updateDraft((prev) => {
      const entries = [...prev.work.entries];
      const updated = { ...entries[index] } as WorkEntry;
      if (['minutes', 'hours', 'kilometers', 'hourlyAmount', 'kmAmount'].includes(field)) {
        updated[field] = toNumber(value) as never;
        if (field === 'hours') {
          updated.minutes = Math.round(toNumber(value) * 60);
        }
      } else {
        updated[field] = value as never;
      }
      entries[index] = updated;
      return {
        ...prev,
        work: {
          ...prev.work,
          entries
        }
      };
    });
  };

  const handleInventoryChange = (
    key: 'hardware' | 'software',
    index: number,
    field: keyof InventoryItem,
    value: string
  ) => {
    updateDraft((prev) => {
      const list = [...prev[key]];
      const updated = { ...list[index] } as InventoryItem;
      if (['quantity', 'unitPrice', 'totalPrice'].includes(field)) {
        updated[field] = toNumber(value) as never;
        if (field === 'quantity' || field === 'unitPrice') {
          updated.totalPrice = toNumber(updated.quantity) * toNumber(updated.unitPrice);
        }
      } else {
        updated[field] = value as never;
      }
      list[index] = updated;
      return {
        ...prev,
        [key]: list
      };
    });
  };

  const addServiceRow = () => {
    updateDraft((prev) => ({
      ...prev,
      services: [
        ...prev.services,
        {
          id: null,
          serviceName: '',
          description: '',
          monthlyPrice: 0,
          isActive: true
        }
      ]
    }));
  };

  const removeServiceRow = (index: number) => {
    updateDraft((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index)
    }));
  };

  const addInventoryRow = (key: 'hardware' | 'software') => {
    updateDraft((prev) => ({
      ...prev,
      [key]: [
        ...prev[key],
        {
          id: null,
          itemName: '',
          description: '',
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
          status: key === 'hardware' ? 'MANUAL' : undefined,
          supplier: null,
          invoiceNumber: null,
          sourceInvoiceItemId: null
        }
      ]
    }));
  };

  const removeInventoryRow = (key: 'hardware' | 'software', index: number) => {
    updateDraft((prev) => ({
      ...prev,
      [key]: prev[key].filter((_, i) => i !== index)
    }));
  };

  const addWorkEntry = () => {
    updateDraft((prev) => ({
      ...prev,
      work: {
        ...prev.work,
        entries: [
          ...prev.work.entries,
          {
            id: null,
            date: null,
            worker: '',
            description: '',
            minutes: 0,
            hours: 0,
            kilometers: 0,
            hourlyAmount: 0,
            kmAmount: 0,
            projectCode: '',
            branch: '',
            timeFrom: '',
            timeTo: ''
          }
        ]
      }
    }));
  };

  const removeWorkEntry = (index: number) => {
    updateDraft((prev) => ({
      ...prev,
      work: {
        ...prev.work,
        entries: prev.work.entries.filter((_, i) => i !== index)
      }
    }));
  };

  const handleSave = async () => {
    if (!draftData || !selectedOrganizationId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    setSaving(true);
    setSaveState('idle');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_URL}/api/billing/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          organizationId: selectedOrganizationId,
          month: selectedMonth,
          year: selectedYear,
          data: draftData
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Uložení návrhu selhalo');
      }

      const payload = await response.json();
      setDraftMeta({ updatedAt: payload.updatedAt, updatedBy: payload.updatedBy });
      setSaveState('saved');
      setIsDirty(false);
    } catch (error: any) {
      console.error(error);
      setSaveState('error');
      setErrorMessage(error.message || 'Nastala chyba při ukládání');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  const headerLabel = baseData
    ? `${baseData.organization.name} — ${selectedMonth}/${selectedYear}`
    : 'Fakturace';

  return (
    <Layout user={user}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-800">Fakturace</h1>
          <div className="flex flex-wrap gap-3 items-center">
            <div>
              <label className="block text-sm font-semibold text-gray-600">Organizace</label>
              <select
                value={selectedOrganizationId ?? ''}
                onChange={(e) => setSelectedOrganizationId(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2"
              >
                {organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} {org.code ? `(${org.code})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600">Měsíc</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-600">Rok</label>
              <input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded px-3 py-2 w-28"
                min={2020}
                max={2100}
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !isDirty || !draftData}
              className={`px-4 py-2 rounded text-white ${
                saving || !isDirty ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {saving ? 'Ukládám...' : 'Uložit návrh'}
            </button>
            {saveState === 'saved' && (
              <span className="text-green-600 text-sm">Uloženo</span>
            )}
            {saveState === 'error' && (
              <span className="text-red-600 text-sm">Chyba při ukládání</span>
            )}
          </div>
        </div>

        {draftMeta && (
          <div className="bg-blue-50 border border-blue-200 rounded px-4 py-3 text-sm text-blue-800">
            Poslední úprava: {new Date(draftMeta.updatedAt).toLocaleString('cs-CZ')}
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-100 border border-red-200 rounded px-4 py-3 text-red-700">
            {errorMessage}
          </div>
        )}

        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-12 text-center text-gray-600">
            Načítám data fakturace...
          </div>
        )}

        {!loading && draftData && baseData && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-green-600 text-white px-4 py-3 font-bold">
                {headerLabel}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6">
                <div className="bg-green-50 border border-green-200 rounded p-4">
                  <p className="text-sm text-green-700 font-semibold">Paušální služby</p>
                  <p className="text-2xl font-bold text-green-900">
                    {computedTotals ? computedTotals.servicesAmount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' }) : '-'}
                  </p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded p-4">
                  <p className="text-sm text-orange-700 font-semibold">Práce IT techniků</p>
                  <p className="text-2xl font-bold text-orange-900">
                    {computedTotals ? computedTotals.workAmount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' }) : '-'}
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <p className="text-sm text-blue-700 font-semibold">Výjezdy / dopravné</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {computedTotals ? computedTotals.kmAmount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' }) : '-'}
                  </p>
                </div>
                <div className="bg-gray-100 border border-gray-300 rounded p-4">
                  <p className="text-sm text-gray-700 font-semibold">Celkem (bez DPH)</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {computedTotals ? computedTotals.totalAmount.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' }) : '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    S DPH: {computedTotals ? computedTotals.totalWithVat.toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' }) : '-'}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 font-bold text-gray-700">
                Sazby
              </div>
              <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 font-semibold">Hodinová sazba (paušál)</label>
                  <input
                    type="number"
                    value={draftData.rates.hourlyRate}
                    onChange={(e) => handleRateChange('hourlyRate', e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 font-semibold">Sazba za kilometr</label>
                  <input
                    type="number"
                    value={draftData.rates.kmRate}
                    onChange={(e) => handleRateChange('kmRate', e.target.value)}
                    className="border border-gray-300 rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 font-semibold">Hodinová sazba nad rámec</label>
                  <input
                    type="number"
                    value={draftData.rates.extraHourlyRate}
                    onChange={(e) => handleRateChange('extraHourlyRate', e.target.value)}
                    placeholder="např. 750"
                    className="border border-gray-300 rounded px-3 py-2 w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 font-semibold">Sazba za kilometr nad rámec</label>
                  <input
                    type="number"
                    value={draftData.rates.extraKmRate}
                    onChange={(e) => handleRateChange('extraKmRate', e.target.value)}
                    placeholder="např. 10"
                    className="border border-gray-300 rounded px-3 py-2 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-green-600 text-white px-4 py-3 font-bold flex items-center justify-between">
                <span>Služby (paušál)</span>
                <button onClick={addServiceRow} className="bg-white text-green-600 rounded px-3 py-1 text-sm font-semibold">
                  + Přidat službu
                </button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-green-50">
                  <tr>
                    <th className="text-left px-4 py-2">Název</th>
                    <th className="text-left px-4 py-2">Popis</th>
                    <th className="text-right px-4 py-2">Cena (Kč)</th>
                    <th className="text-center px-4 py-2">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {draftData.services.map((service, index) => (
                    <tr key={`service-${index}`} className="border-b border-gray-200">
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={service.serviceName}
                          onChange={(e) => handleServiceChange(index, 'serviceName', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={service.description || ''}
                          onChange={(e) => handleServiceChange(index, 'description', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          value={service.monthlyPrice}
                          onChange={(e) => handleServiceChange(index, 'monthlyPrice', e.target.value)}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-right"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          onClick={() => removeServiceRow(index)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          Odebrat
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draftData.services.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-gray-500">
                        Žádné položky – přidejte nové tlačítkem výše.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-orange-500 text-white px-4 py-3 font-bold flex items-center justify-between">
                <span>Práce IT techniků (nad rámec)</span>
                <button onClick={addWorkEntry} className="bg-white text-orange-600 rounded px-3 py-1 text-sm font-semibold">
                  + Přidat záznam
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-orange-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Datum</th>
                      <th className="px-3 py-2 text-left">Pracovník</th>
                      <th className="px-3 py-2 text-left">Popis</th>
                      <th className="px-3 py-2 text-right">Hodiny</th>
                      <th className="px-3 py-2 text-right">Km</th>
                      <th className="px-3 py-2 text-right">Částka (hod.)</th>
                      <th className="px-3 py-2 text-right">Částka (km)</th>
                      <th className="px-3 py-2 text-center">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftData.work.entries.map((entry, index) => (
                      <tr key={`work-${index}`} className="border-b border-gray-200">
                        <td className="px-3 py-2">
                          <input
                            type="date"
                            value={entry.date ? entry.date.split('T')[0] : ''}
                            onChange={(e) => handleWorkEntryChange(index, 'date', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={entry.worker || ''}
                            onChange={(e) => handleWorkEntryChange(index, 'worker', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={entry.description || ''}
                            onChange={(e) => handleWorkEntryChange(index, 'description', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 w-56"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={entry.hours}
                            onChange={(e) => handleWorkEntryChange(index, 'hours', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={entry.kilometers}
                            onChange={(e) => handleWorkEntryChange(index, 'kilometers', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={entry.hourlyAmount}
                            onChange={(e) => handleWorkEntryChange(index, 'hourlyAmount', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={entry.kmAmount}
                            onChange={(e) => handleWorkEntryChange(index, 'kmAmount', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeWorkEntry(index)} className="text-sm text-red-600 hover:underline">
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {draftData.work.entries.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-4 text-center text-gray-500">
                          Žádné nadlimitní práce – přidejte nový záznam.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-blue-600 text-white px-4 py-3 font-bold flex items-center justify-between">
                <span>Hardware</span>
                <div className="flex gap-2">
                  <button
                    onClick={fetchAvailableHardware}
                    className="bg-white text-blue-600 rounded px-3 py-1 text-sm font-semibold"
                    disabled={hardwareLoading || !selectedOrganizationId}
                  >
                    {hardwareLoading ? 'Načítám...' : 'Načíst hardware z faktur'}
                  </button>
                  <button onClick={() => addInventoryRow('hardware')} className="bg-white text-blue-600 rounded px-3 py-1 text-sm font-semibold">
                    + Přidat ručně
                  </button>
                </div>
              </div>
              {hardwareError && (
                <div className="bg-red-50 text-red-700 px-4 py-2 border-b border-red-200 text-sm">
                  {hardwareError}
                </div>
              )}
              {availableHardware.length > 0 && (
                <div className="bg-blue-50 px-4 py-3 border-b border-blue-100">
                  <p className="font-semibold text-blue-700 text-sm mb-2">
                    Položky připravené k vyúčtování ({availableHardware.length}) - kliknutím přidáte do fakturace
                  </p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-blue-100">
                        <tr>
                          <th className="px-2 py-1 text-left">Položka</th>
                          <th className="px-2 py-1 text-left">Dodavatel</th>
                          <th className="px-2 py-1 text-right">Cena</th>
                          <th className="px-2 py-1 text-center">Akce</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availableHardware.map((hardware) => (
                          <tr key={hardware.id} className="border-b border-blue-100">
                            <td className="px-2 py-1">{hardware.itemName}</td>
                            <td className="px-2 py-1">{hardware.invoiceItem?.invoice?.supplierName || '-'}</td>
                            <td className="px-2 py-1 text-right">
                              {Number(hardware.totalPrice || 0).toLocaleString('cs-CZ', { style: 'currency', currency: 'CZK' })}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button
                                className="text-sm text-blue-700 hover:underline"
                                onClick={() => handleAddHardwareFromPool(hardware)}
                              >
                                Přidat do fakturace
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <table className="w-full text-sm">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Název</th>
                      <th className="px-3 py-2 text-left">Popis</th>
                      <th className="px-3 py-2 text-right">Množství</th>
                      <th className="px-3 py-2 text-right">Cena/ks</th>
                      <th className="px-3 py-2 text-right">Celkem</th>
                      <th className="px-3 py-2 text-center">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftData.hardware.map((item, index) => (
                      <tr key={`hardware-${index}`} className="border-b border-gray-200">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => handleInventoryChange('hardware', index, 'itemName', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => handleInventoryChange('hardware', index, 'description', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleInventoryChange('hardware', index, 'quantity', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => handleInventoryChange('hardware', index, 'unitPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.totalPrice}
                            onChange={(e) => handleInventoryChange('hardware', index, 'totalPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeInventoryRow('hardware', index)} className="text-sm text-red-600 hover:underline">
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {draftData.hardware.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                          Žádný hardware pro toto období.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
                <div className="bg-purple-600 text-white px-4 py-3 font-bold flex items-center justify-between">
                  <span>Software</span>
                  <button onClick={() => addInventoryRow('software')} className="bg-white text-purple-600 rounded px-3 py-1 text-sm font-semibold">
                    + Přidat položku
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-purple-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Název</th>
                      <th className="px-3 py-2 text-left">Popis</th>
                      <th className="px-3 py-2 text-right">Množství</th>
                      <th className="px-3 py-2 text-right">Cena/ks</th>
                      <th className="px-3 py-2 text-right">Celkem</th>
                      <th className="px-3 py-2 text-center">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draftData.software.map((item, index) => (
                      <tr key={`software-${index}`} className="border-b border-gray-200">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => handleInventoryChange('software', index, 'itemName', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={item.description || ''}
                            onChange={(e) => handleInventoryChange('software', index, 'description', e.target.value)}
                            className="w-full border border-gray-300 rounded px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleInventoryChange('software', index, 'quantity', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => handleInventoryChange('software', index, 'unitPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={item.totalPrice}
                            onChange={(e) => handleInventoryChange('software', index, 'totalPrice', e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => removeInventoryRow('software', index)} className="text-sm text-red-600 hover:underline">
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                    {draftData.software.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                          Žádný software pro toto období.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-300 overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 font-bold text-gray-700">
                Poznámky
              </div>
              <div className="p-4">
                <textarea
                  value={draftData.notes || ''}
                  onChange={(e) => updateDraft((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  rows={4}
                  placeholder="Interní poznámky k fakturaci..."
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
};

export default FakturacePage;
