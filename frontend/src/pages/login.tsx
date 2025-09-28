import React, { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-md border border-gray-300 w-full max-w-md overflow-hidden">
        <div className="bg-green-600 text-white px-6 py-4 text-center">
          <h1 className="text-2xl font-bold">Fakturační Systém</h1>
          <p className="text-sm mt-1">Přihlášení do systému</p>
        </div>
        
        <div className="p-6">
        
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-bold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-green-600"
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-bold text-gray-700 mb-2">
                Heslo
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-green-600"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Přihlašování...' : 'Přihlásit se'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-gray-100 rounded border border-gray-300">
            <p className="text-sm font-bold text-gray-700 mb-1">Testovací přihlašovací údaje:</p>
            <p className="text-sm">Email: <span className="font-mono">admin@fakturace.cz</span></p>
            <p className="text-sm">Heslo: <span className="font-mono">admin123</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}