import axios from 'axios';

const trimTrailingSlash = (value: string) => value.replace(/\/$/, '');

const resolveApiBaseUrl = () => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (typeof window !== 'undefined') {
    return trimTrailingSlash(window.location.origin);
  }

  return '';
};

export const createApiClient = (token?: string) => {
  const apiBase = resolveApiBaseUrl();
  const baseURL = apiBase ? `${apiBase}/api` : '/api';

  const instance = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  instance.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  return instance;
};
