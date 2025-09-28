import React, { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface LayoutProps {
  children: ReactNode;
  user: {
    name: string;
    email: string;
  };
}

export default function Layout({ children, user }: LayoutProps) {
  const router = useRouter();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navigation = [
    { name: '📊 Dashboard', href: '/dashboard' },
    { name: '🏢 Organizace', href: '/organizations' },
    { name: '⏱️ Výkazy práce', href: '/work-records' },
    { name: '📄 Faktury', href: '/invoices' },
    { name: '📥 Import dat', href: '/import' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--gray-bg)' }}>
      {/* Header */}
      <div className="no-print" style={{ 
        backgroundColor: 'var(--primary-green)', 
        color: 'var(--white)', 
        height: '50px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center'
      }}>
        <div style={{ 
          maxWidth: '1400px', 
          margin: '0 auto', 
          width: '100%',
          padding: '0 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ 
            fontSize: '20px', 
            fontWeight: 'bold',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            📊 Fakturační Systém
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <nav style={{ display: 'flex', gap: '0' }}>
              {navigation.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <Link key={item.name} href={item.href}>
                    <a style={{
                      padding: '0 20px',
                      height: '50px',
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--white)',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: isActive ? 'bold' : 'normal',
                      backgroundColor: isActive ? 'rgba(255,255,255,0.1)' : 'transparent',
                      borderBottom: isActive ? '3px solid var(--white)' : 'none',
                      transition: 'background-color 0.3s',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}>
                      {item.name}
                    </a>
                  </Link>
                );
              })}
            </nav>
            <div style={{ 
              borderLeft: '1px solid rgba(255,255,255,0.3)', 
              paddingLeft: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px'
            }}>
              <span style={{ fontSize: '14px' }}>{user.name}</span>
              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ 
                  backgroundColor: 'transparent',
                  color: 'var(--white)',
                  border: '1px solid var(--white)',
                  padding: '6px 15px',
                  fontSize: '13px',
                  margin: 0
                }}
              >
                Odhlásit
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '20px'
      }}>
        {children}
      </main>
    </div>
  );
}