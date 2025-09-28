import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
}

export default function ImportPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{type: 'success' | 'error' | null, message: string}>({type: null, message: ''});

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
  }, [router]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Kontrola typu souboru
      const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
      if (!validTypes.includes(selectedFile.type)) {
        setUploadStatus({
          type: 'error',
          message: 'Prosím vyberte platný Excel soubor (.xls nebo .xlsx)'
        });
        return;
      }
      
      setFile(selectedFile);
      setUploadStatus({type: null, message: ''});
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadStatus({type: null, message: ''});

    const formData = new FormData();
    formData.append('file', file);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/import/excel', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        setUploadStatus({
          type: 'success',
          message: `Import úspěšný! Zpracováno ${data.recordsCount} záznamů.`
        });
        setFile(null);
        
        // Reset file inputu
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        const error = await response.json();
        setUploadStatus({
          type: 'error',
          message: error.message || 'Chyba při importu souboru'
        });
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: 'Chyba připojení k serveru'
      });
    } finally {
      setUploading(false);
    }
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

  return (
    <Layout user={user}>
      <div className="container">
        <h1>Import dat z Excelu</h1>
        
        <div className="table-container" style={{ marginBottom: '30px' }}>
          <div className="section-header">
            📊 NAHRÁNÍ EXCEL SOUBORU
          </div>
          <div style={{ padding: '30px' }}>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="file-input" style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>
                Vyberte Excel soubor s daty:
              </label>
              <input
                id="file-input"
                type="file"
                accept=".xls,.xlsx"
                onChange={handleFileChange}
                style={{
                  padding: '10px',
                  border: '2px dashed var(--border-color)',
                  borderRadius: '4px',
                  width: '100%',
                  cursor: 'pointer'
                }}
              />
            </div>
            
            {file && (
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: 'var(--section-header)', borderRadius: '4px' }}>
                <strong>Vybraný soubor:</strong> {file.name} ({(file.size / 1024).toFixed(2)} KB)
              </div>
            )}
            
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={!file || uploading}
              style={{ opacity: (!file || uploading) ? 0.5 : 1 }}
            >
              {uploading ? 'Nahrávání...' : '📤 Nahrát a importovat'}
            </button>
          </div>
        </div>

        {uploadStatus.type && (
          <div className={uploadStatus.type === 'success' ? 'info-box' : 'info-box'} 
               style={{ 
                 backgroundColor: uploadStatus.type === 'success' ? 'var(--section-header)' : '#ffebee',
                 borderColor: uploadStatus.type === 'success' ? 'var(--status-success)' : 'var(--status-error)'
               }}>
            <p style={{ margin: 0 }}>
              <strong>{uploadStatus.type === 'success' ? '✅' : '❌'}</strong> {uploadStatus.message}
            </p>
          </div>
        )}

        <div className="table-container">
          <div className="section-header">
            📋 FORMÁT EXCEL SOUBORU
          </div>
          <div style={{ padding: '20px' }}>
            <p style={{ marginBottom: '15px' }}>
              Excel soubor musí obsahovat následující sloupce:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Sloupec</th>
                  <th>Popis</th>
                  <th>Příklad</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Datum</strong></td>
                  <td>Datum provedení práce</td>
                  <td>15.7.2025</td>
                </tr>
                <tr>
                  <td><strong>Organizace</strong></td>
                  <td>Název organizace</td>
                  <td>Lázně Toušeň</td>
                </tr>
                <tr>
                  <td><strong>Pracovník</strong></td>
                  <td>Jméno pracovníka</td>
                  <td>Jan Novák</td>
                </tr>
                <tr>
                  <td><strong>Popis</strong></td>
                  <td>Popis vykonané práce</td>
                  <td>Instalace softwaru</td>
                </tr>
                <tr>
                  <td><strong>Hodiny</strong></td>
                  <td>Počet odpracovaných hodin</td>
                  <td>2:30</td>
                </tr>
                <tr>
                  <td><strong>Km</strong></td>
                  <td>Počet ujetých kilometrů</td>
                  <td>25</td>
                </tr>
              </tbody>
            </table>
            
            <div style={{ marginTop: '20px', padding: '15px', backgroundColor: 'var(--info-box)', borderRadius: '4px' }}>
              <p style={{ margin: '0 0 10px 0' }}>
                <strong>💡 Tip:</strong> První řádek musí obsahovat názvy sloupců. Data začínají od druhého řádku.
              </p>
              <button 
                onClick={async () => {
                  const token = localStorage.getItem('token');
                  const response = await fetch('/api/import/template', {
                    headers: {
                      'Authorization': `Bearer ${token}`
                    }
                  });
                  if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'vzor_import.xlsx';
                    a.click();
                  }
                }}
                className="btn btn-secondary"
              >
                📥 Stáhnout vzorový soubor
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}