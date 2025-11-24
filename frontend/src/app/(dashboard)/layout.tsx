'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Center, Loader } from '@mantine/core';
import { useAuth } from '@/lib/auth-context';
import { AppShellLayout } from '@/components/navigation/AppShell';

const publicPaths = ['/login'];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, isLoading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !token && !publicPaths.includes(pathname)) {
      router.replace('/login');
    }
  }, [isLoading, token, router, pathname]);

  useEffect(() => {
    if (!isLoading && token && user?.role === 'TECHNICIAN') {
      if (pathname && !pathname.startsWith('/work-records')) {
        router.replace('/work-records');
      }
    }
  }, [isLoading, token, user?.role, pathname, router]);

  if (isLoading || (!token && !publicPaths.includes(pathname))) {
    return (
      <Center h="100vh">
        <Loader color="blue" size="lg" />
      </Center>
    );
  }

  if (!token) {
    return <>{children}</>;
  }

  return <AppShellLayout>{children}</AppShellLayout>;
}
