import React, { useState, useEffect } from 'react';
import { API_URL } from '../config/api';

interface WorkRecordFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingRecord?: any;
}

interface Organization {
  id: number;
  name: string;
  code: string;
}

export default function WorkRecordForm({ isOpen, onClose, onSuccess, editingRecord }: WorkRecordFormProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    worker: '',
    organizationId: '',
    branch: '',
    description: '',
    timeFrom: '',
    timeTo: '',
    kilometers: '0'
  });

  useEffect(() => {
    if (isOpen) {
      fetchOrganizations();

      if (editingRecord) {
        // Editace - načti data z záznamu
        setFormData({
          date: editingRecord.date.split('T')[0],
          worker: editingRecord.worker,
          organizationId: editingRecord.organization.id.toString(),
          branch: editingRecord.branch || '',
          description: editingRecord.description,
          timeFrom: editingRecord.timeFrom || '',
          timeTo: editingRecord.timeTo || '',
          kilometers: editingRecord.kilometers.toString()
        });
      } else {
        // Nový záznam - načti jméno přihlášeného uživatele
        const userData = localStorage.getItem('user');
        if (userData) {
          const user = JSON.parse(userData);
          setFormData(prev => ({ ...prev, worker: user.name }));
        }
      }
    }
  }, [isOpen, editingRecord]);

  const fetchOrganizations = async () => {
    try {
      const token = localStorage.getItem('token');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const url = editingRecord
        ? `${API_URL}/api/work-records/${editingRecord.id}`
        : `${API_URL}/api/work-records`;

      const method = editingRecord ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...formData,
          organizationId: parseInt(formData.organizationId),
          kilometers: parseInt(formData.kilometers)
        })
      });

      if (response.ok) {
        // Reset formuláře
        setFormData({
          date: new Date().toISOString().split('T')[0],
          worker: formData.worker,
          organizationId: '',
          branch: '',
          description: '',
          timeFrom: '',
          timeTo: '',
          kilometers: '0'
        });
        onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setError(data.error || (editingRecord ? 'Chyba při ukládání výkazu' : 'Chyba při vytváření výkazu'));
      }
    } catch (error) {
      console.error('Error saving work record:', error);
      setError('Chyba při komunikaci se serverem');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingRecord ? 'Upravit výkaz práce' : 'Nový výkaz práce'}</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Datum *</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Pracovník *</label>
              <input
                type="text"
                value={formData.worker}
                onChange={(e) => handleChange('worker', e.target.value)}
                required
                placeholder="Jméno pracovníka"
              />
            </div>

            <div className="form-group">
              <label>Organizace *</label>
              <select
                value={formData.organizationId}
                onChange={(e) => handleChange('organizationId', e.target.value)}
                required
              >
                <option value="">Vyberte organizaci</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Pobočka</label>
              <input
                type="text"
                value={formData.branch}
                onChange={(e) => handleChange('branch', e.target.value)}
                placeholder="Název pobočky"
              />
            </div>

            <div className="form-group">
              <label>Čas od *</label>
              <input
                type="time"
                value={formData.timeFrom}
                onChange={(e) => handleChange('timeFrom', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Čas do *</label>
              <input
                type="time"
                value={formData.timeTo}
                onChange={(e) => handleChange('timeTo', e.target.value)}
                required
              />
            </div>

            <div className="form-group full-width">
              <label>Popis práce (výkon) *</label>
              <textarea
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                required
                placeholder="Popište vykonanou práci..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Počet ujetých kilometrů</label>
              <input
                type="number"
                value={formData.kilometers}
                onChange={(e) => handleChange('kilometers', e.target.value)}
                min="0"
                placeholder="0"
              />
            </div>
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Zrušit
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Ukládání...' : (editingRecord ? 'Uložit změny' : 'Uložit výkaz')}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          background: white;
          border-radius: 8px;
          max-width: 800px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          border-bottom: 1px solid #e5e7eb;
        }

        .modal-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 28px;
          cursor: pointer;
          color: #6b7280;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .close-button:hover {
          background: #f3f4f6;
          color: #374151;
        }

        form {
          padding: 24px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .form-group.full-width {
          grid-column: 1 / -1;
        }

        .form-group label {
          margin-bottom: 6px;
          font-weight: 500;
          color: #374151;
          font-size: 14px;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }

        .form-group input:focus,
        .form-group select:focus,
        .form-group textarea:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .form-group textarea {
          resize: vertical;
          font-family: inherit;
        }

        .error-message {
          background: #fee;
          color: #c00;
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 20px;
          font-size: 14px;
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
        }

        @media (max-width: 768px) {
          .form-grid {
            grid-template-columns: 1fr;
          }

          .modal-content {
            max-height: 100vh;
            border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
