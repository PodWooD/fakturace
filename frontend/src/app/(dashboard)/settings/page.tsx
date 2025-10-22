'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  LoadingOverlay,
  Modal,
  PasswordInput,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconMoonStars, IconPencil, IconPlus, IconSun, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { useThemeSettings } from '@/lib/theme-context';

type EditableUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

const roleOptions = [
  { label: 'Administrátor', value: 'ADMIN' },
  { label: 'Účetní', value: 'ACCOUNTANT' },
  { label: 'Technik', value: 'TECHNICIAN' },
  { label: 'Viewer', value: 'VIEWER' },
];

export default function SettingsPage() {
  const { token, user } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const queryClient = useQueryClient();
  const { colorScheme, setColorScheme, toggleColorScheme } = useThemeSettings();

  const role = user?.role as UserRole;
  const canManageUsers = hasPermission(role, 'users:manage');

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<EditableUser | null>(null);
  const [formValues, setFormValues] = useState({
    name: '',
    email: '',
    role: 'VIEWER',
    password: '',
  });

  const usersQuery = useQuery<EditableUser[]>({
    queryKey: ['users'],
    enabled: Boolean(token) && canManageUsers,
    queryFn: async () => {
      const response = await api.get('/users');
      return response.data;
    },
  });

  const closeModal = () => {
    setUserModalOpen(false);
    setEditingUser(null);
    setFormValues({ name: '', email: '', role: 'VIEWER', password: '' });
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormValues({ name: '', email: '', role: 'VIEWER', password: '' });
    setUserModalOpen(true);
  };

  const openEditModal = (user: EditableUser) => {
    setEditingUser(user);
    setFormValues({ name: user.name, email: user.email, role: user.role, password: '' });
    setUserModalOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: formValues.name,
        email: formValues.email,
        role: formValues.role,
        password: formValues.password,
      };
      await api.post('/users', payload);
    },
    onSuccess: async () => {
      notifications.show({ title: 'Uživatel vytvořen', message: 'Nový uživatel byl přidán.', color: 'green' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Nepodařilo se vytvořit uživatele.';
      notifications.show({ title: 'Chyba', message, color: 'red' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingUser) return;
      const payload: Record<string, string> = {
        name: formValues.name,
        email: formValues.email,
        role: formValues.role,
      };
      if (formValues.password) {
        payload.password = formValues.password;
      }
      await api.put(`/users/${editingUser.id}`, payload);
    },
    onSuccess: async () => {
      notifications.show({ title: 'Uživatel upraven', message: 'Změny byly uloženy.', color: 'green' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      closeModal();
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Nepodařilo se upravit uživatele.';
      notifications.show({ title: 'Chyba', message, color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: async () => {
      notifications.show({ title: 'Uživatel odstraněn', message: 'Uživatel byl smazán.', color: 'green' });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.error || 'Nepodařilo se smazat uživatele.';
      notifications.show({ title: 'Chyba', message, color: 'red' });
    },
  });

  const handleSubmit = () => {
    if (editingUser) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  return (
    <Stack gap="xl">
      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={3}>Motiv aplikace</Title>
            <Group gap="xs">
              <ActionIcon variant="subtle" onClick={toggleColorScheme} aria-label="Přepnout motiv">
                {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoonStars size={18} />}
              </ActionIcon>
              <SegmentedControl
                value={colorScheme}
                onChange={(value) => setColorScheme(value as 'light' | 'dark')}
                data={[
                  { label: 'Světlý', value: 'light' },
                  { label: 'Tmavý', value: 'dark' },
                ]}
              />
            </Group>
          </Group>
          <Text c="dimmed" size="sm">
            Nastavený motiv se ukládá do prohlížeče a použije se při příštím přihlášení.
          </Text>
        </Stack>
      </Card>

      <Card withBorder radius="md" shadow="sm">
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Title order={3}>Správa uživatelů</Title>
            {canManageUsers ? (
              <Button leftSection={<IconPlus size={16} />} onClick={openCreateModal}>
                Přidat uživatele
              </Button>
            ) : null}
          </Group>
          {!canManageUsers ? (
            <Alert color="yellow" variant="light">
              Nemáte oprávnění spravovat uživatele.
            </Alert>
          ) : (
            <Card withBorder radius="md">
              <LoadingOverlay visible={usersQuery.isLoading} />
              {usersQuery.data && usersQuery.data.length ? (
                <ScrollArea>
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Jméno</Table.Th>
                        <Table.Th>E-mail</Table.Th>
                        <Table.Th>Role</Table.Th>
                        <Table.Th>Vytvořeno</Table.Th>
                        <Table.Th ta="right">Akce</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {usersQuery.data.map((item) => (
                        <Table.Tr key={item.id}>
                          <Table.Td>{item.name}</Table.Td>
                          <Table.Td>{item.email}</Table.Td>
                          <Table.Td>
                            <Badge>{item.role}</Badge>
                          </Table.Td>
                          <Table.Td>{new Date(item.createdAt).toLocaleDateString('cs-CZ')}</Table.Td>
                          <Table.Td ta="right">
                            <Group gap="xs" justify="flex-end">
                              <ActionIcon
                                variant="subtle"
                                onClick={() => openEditModal(item)}
                                aria-label="Upravit"
                              >
                                <IconPencil size={16} />
                              </ActionIcon>
                              <ActionIcon
                                variant="light"
                                color="red"
                                onClick={() => {
                                  if (item.id === user?.id) {
                                    notifications.show({
                                      title: 'Nelze odstranit sebe',
                                      message: 'Nemůžete odstranit aktuálně přihlášeného uživatele.',
                                      color: 'red',
                                    });
                                    return;
                                  }
                                  if (window.confirm(`Opravdu chcete smazat uživatele ${item.email}?`)) {
                                    deleteMutation.mutate(item.id);
                                  }
                                }}
                                aria-label="Smazat"
                              >
                                <IconTrash size={16} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              ) : (
                <Text c="dimmed">Žádní uživatelé nejsou k dispozici.</Text>
              )}
            </Card>
          )}
        </Stack>
      </Card>

      <Modal
        opened={userModalOpen}
        onClose={closeModal}
        title={editingUser ? 'Upravit uživatele' : 'Nový uživatel'}
        size="md"
      >
        <Stack gap="sm">
          <TextInput
            label="Jméno"
            value={formValues.name}
            onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.currentTarget.value }))}
            required
          />
          <TextInput
            label="E-mail"
            value={formValues.email}
            onChange={(event) => setFormValues((prev) => ({ ...prev, email: event.currentTarget.value }))}
            required
            type="email"
          />
          <Select
            label="Role"
            data={roleOptions}
            value={formValues.role}
            onChange={(value) =>
              setFormValues((prev) => ({ ...prev, role: value ?? prev.role }))
            }
            required
          />
          <PasswordInput
            label={editingUser ? 'Nové heslo (volitelné)' : 'Heslo'}
            value={formValues.password}
            onChange={(event) => setFormValues((prev) => ({ ...prev, password: event.currentTarget.value }))}
            required={!editingUser}
          />
          <Group justify="flex-end">
            <Button
              onClick={handleSubmit}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {editingUser ? 'Uložit změny' : 'Vytvořit uživatele'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
