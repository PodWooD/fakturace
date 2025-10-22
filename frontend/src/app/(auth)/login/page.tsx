'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Anchor,
  Button,
  Loader,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Neplatný e-mail'),
  password: z.string().min(4, 'Zadejte heslo'),
});

type FormValues = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const { token, login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (token) {
      router.replace('/');
    }
  }, [token, router]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const api = createApiClient();
      const response = await api.post('/auth/login', values);
      login(response.data.token, response.data.user);
      notifications.show({
        title: 'Přihlášení úspěšné',
        message: `Vítejte zpět, ${response.data.user.name}`,
        color: 'green',
      });
      router.replace('/');
    } catch (error: any) {
      notifications.show({
        title: 'Nepodařilo se přihlásit',
        message: error?.response?.data?.error || 'Zkontrolujte přihlašovací údaje',
        color: 'red',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack mih="100vh" align="center" justify="center" px="md" py="xl" bg="gray.1">
      <Paper shadow="md" radius="lg" p="xl" w={380} withBorder>
        <Stack>
          <Title order={3}>Fakturace v1.0</Title>
          <Text size="sm" c="dimmed">
            Přihlaste se do administračního rozhraní.
          </Text>
          <form onSubmit={handleSubmit(onSubmit)}>
            <Stack>
              <TextInput
                label="E-mail"
                placeholder="admin@fakturace.cz"
                {...register('email')}
                error={errors.email?.message}
                required
              />
              <PasswordInput
                label="Heslo"
                placeholder="••••••"
                {...register('password')}
                error={errors.password?.message}
                required
              />
              <Button type="submit" loading={isSubmitting} fullWidth>
                Přihlásit se
              </Button>
            </Stack>
          </form>
          <Text size="xs" c="dimmed" ta="center">
            Potřebujete pomoc? Kontaktujte <Anchor href="mailto:support@fakturace.cz">support@fakturace.cz</Anchor>
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}

export default function LoginPage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <Stack mih="100vh" align="center" justify="center">
        <Loader color="blue" size="lg" />
      </Stack>
    );
  }

  return <LoginForm />;
}
