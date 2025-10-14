import React, { ReactNode, useState } from 'react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  const navigation = [
    { name: '📊 Dashboard', href: '/dashboard' },
    { name: '🏢 Organizace', href: '/organizations' },
    { name: '⏱️ Výkazy práce', href: '/work-records' },
    { name: '💶 Fakturace', href: '/fakturace' },
    { name: '📄 Faktury', href: '/invoices' },
    { name: '📥 Import dat', href: '/import' },
    { name: '🧾 Faktury přijaté', href: '/received-invoices' },
    { name: '🛠️ Hardware', href: '/hardware' },
    { name: '📤 Export', href: '/export' },
    { name: '📈 Reporty', href: '/reports' },
  ];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--gray-bg)' }}>
      {/* Header */}
      <div className="no-print app-header">
        <div className="header-container">
          <div className="header-left">
            <h1 className="header-title">
              📊 Fakturační Systém
            </h1>
          </div>

          {/* Hamburger menu tlačítko (mobile) */}
          <button
            className="mobile-menu-button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          {/* Desktop navigace */}
          <div className="header-right desktop-nav">
            <nav className="nav-menu">
              {navigation.map((item) => {
                const isActive = router.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
            <div className="user-section">
              <span className="user-name">{user.name}</span>
              <button onClick={handleLogout} className="logout-button">
                Odhlásit
              </button>
            </div>
          </div>
        </div>

        {/* Mobile navigace */}
        <div className={`mobile-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <nav className="mobile-nav-menu">
            {navigation.map((item) => {
              const isActive = router.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.name}
                </Link>
              );
            })}
            <div className="mobile-user-section">
              <span className="mobile-user-name">{user.name}</span>
              <button onClick={handleLogout} className="mobile-logout-button">
                Odhlásit
              </button>
            </div>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
