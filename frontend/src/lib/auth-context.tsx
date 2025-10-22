'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

type User = {
  id: number;
  email: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
};

const STORAGE_TOKEN_KEY = 'fakturace_token';
const STORAGE_USER_KEY = 'fakturace_user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
    const storedUser = localStorage.getItem(STORAGE_USER_KEY);

    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    const parsedUser = storedUser ? (JSON.parse(storedUser) as User) : null;
    setToken(storedToken);
    setUser(parsedUser);

    const verify = async () => {
      try {
        const response = await axios.get<{ user: User }>(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3029'}/api/auth/verify`,
          {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          },
        );
        setUser(response.data.user);
        localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(response.data.user));
      } catch (error) {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    verify();
  }, [clearSession]);

  const login = useCallback((nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_TOKEN_KEY, nextToken);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
};
