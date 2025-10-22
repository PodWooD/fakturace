'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Flex,
  Group,
  Loader,
  Modal,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEdit, IconEye, IconPlus, IconRefresh } from '@tabler/icons-react';
import { useAuth } from '@/lib/auth-context';
import { createApiClient } from '@/lib/api-client';
import { OrganizationForm, OrganizationFormValues } from '@/components/forms/OrganizationForm';

type Service = {
  id: number;
  serviceName: string;
  monthlyPrice: number;
  isActive: boolean;
};

type Organization = {
  id: number;
  name: string;
  code?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  ico?: string | null;
  dic?: string | null;
  hourlyRate?: number | null;
  kilometerRate?: number | null;
  outsourcingFee?: number | null;
  hardwareMarginPct?: number | null;
  softwareMarginPct?: number | null;
  isActive?: boolean;
  services?: Service[];
};

const formatCurrency = (value?: number | null) =>
  new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' }).format(value ?? 0);

export default function OrganizationsPage() {
  const { token } = useAuth();
  const api = useMemo(() => createApiClient(token || undefined), [token]);
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState<(Partial<OrganizationFormValues> & { id?: number }) | null>(
    null,
  );
  const [highlightedId, setHighlightedId] = useState<number | null>(null);

  const organizationsQuery = useQuery<Organization[]>({
    queryKey: ['organizations'],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await api.get('/organizations');
      return response.data.data;
    },
  });

  const organizations = organizationsQuery.data ?? [];

  useEffect(() => {
    if (!organizations.length) {
      return;
    }

    const highlight = searchParams.get('highlight');
    if (!highlight) {
      return;
    }

    const parsed = Number(highlight);
    if (Number.isNaN(parsed)) {
      return;
    }

    setHighlightedId(parsed);
    const element = document.getElementById(`organization-${parsed}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    const timeout = window.setTimeout(() => {
      setHighlightedId(null);
    }, 6000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [organizations, searchParams]);

  const statistics = useMemo(() => {
    if (!organizations.length) {
      return {
        total: 0,
        monthlyServices: 0,
        averageHourlyRate: 0,
      };
    }

    const total = organizations.length;
    const monthlyServices = organizations.reduce((sum, org) => {
      const services = org.services ?? [];
      const activeServices = services
        .filter((service) => service.isActive !== false)
        .reduce((serviceSum, service) => serviceSum + (service.monthlyPrice ?? 0), 0);
      return sum + activeServices;
    }, 0);

    const hourlyRateSum = organizations.reduce(
      (sum, org) => sum + (org.hourlyRate ?? 0),
      0,
    );
    const averageHourlyRate = hourlyRateSum / total;

    return {
      total,
      monthlyServices,
      averageHourlyRate,
    };
  }, [organizations]);

  const upsertMutation = useMutation({
    mutationFn: async ({ values, id }: { values: OrganizationFormValues; id?: number }) => {
      if (id) {
        await api.put(`/organizations/${id}`, values);
      } else {
        const response = await api.post('/organizations', values);
        if (response.data?.id) {
          setHighlightedId(response.data.id);
        }
      }
    },
    onSuccess: () => {
      notifications.show({
        title: 'Hotovo',
        message: 'Organizace byla uložena',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      setOpened(false);
      setEditing(null);
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Chyba',
        message:
          error?.response?.data?.error ||
          'Uložení organizace selhalo. Zkontrolujte vyplněné údaje.',
        color: 'red',
      });
    },
  });

  const handleEdit = (organization: Organization) => {
    setEditing({
      id: organization.id,
      name: organization.name,
      code: organization.code ?? '',
      contactPerson: organization.contactPerson ?? '',
      email: organization.email ?? '',
      phone: organization.phone ?? '',
      address: organization.address ?? '',
      ico: organization.ico ?? '',
      dic: organization.dic ?? '',
      hourlyRate: organization.hourlyRate ?? 0,
      kilometerRate: organization.kilometerRate ?? 0,
      outsourcingFee: organization.outsourcingFee ?? 0,
      hardwareMarginPct: organization.hardwareMarginPct ?? 0,
      softwareMarginPct: organization.softwareMarginPct ?? 0,
      isActive: organization.isActive ?? true,
    });
    setOpened(true);
  };

  const handleSubmit = async (values: OrganizationFormValues) => {
    await upsertMutation.mutateAsync({ values, id: editing?.id });
  };

  const renderStatusBadge = (isActive?: boolean) => (
    <Badge color={isActive ? 'green' : 'gray'} variant="light">
      {isActive ? 'Aktivní' : 'Neaktivní'}
    </Badge>
  );

  const isLoading = organizationsQuery.isLoading;

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="center">
        <Stack gap={4}>
          <Title order={2}>Organizace</Title>
          <Text c="dimmed" size="sm">
            Kompletní seznam klientů včetně sazeb, kontaktů a paušálních služeb.
          </Text>
        </Stack>
        <Group gap="sm">
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="default"
            onClick={() => organizationsQuery.refetch()}
            loading={organizationsQuery.isRefetching}
          >
            Obnovit
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => {
              setEditing({
                name: '',
                code: '',
                contactPerson: '',
                email: '',
                phone: '',
                address: '',
                ico: '',
                dic: '',
                hourlyRate: 0,
                kilometerRate: 0,
                hardwareMarginPct: 0,
                softwareMarginPct: 0,
                outsourcingFee: 0,
                isActive: true,
              });
              setOpened(true);
            }}
          >
            Nová organizace
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder radius="md" shadow="sm">
          <Stack gap="xs" align="center">
            <Text size="sm" c="dimmed">
              Celkový počet organizací
            </Text>
            <Title order={3}>{statistics.total}</Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="orange.0">
          <Stack gap="xs" align="center">
            <Text size="sm" c="dimmed">
              Měsíční příjem z paušálů
            </Text>
            <Title order={3} c="orange.7">
              {formatCurrency(statistics.monthlyServices)}
            </Title>
          </Stack>
        </Card>
        <Card withBorder radius="md" shadow="sm" bg="green.0">
          <Stack gap="xs" align="center">
            <Text size="sm" c="dimmed">
              Průměrná hodinová sazba
            </Text>
            <Title order={3} c="green.7">
              {Math.round(statistics.averageHourlyRate)} Kč
            </Title>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" shadow="sm">
        {isLoading ? (
          <Flex align="center" justify="center" py="xl">
            <Loader color="blue" />
          </Flex>
        ) : organizations.length ? (
          <ScrollArea>
            <Table highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Kód</Table.Th>
                  <Table.Th>Název</Table.Th>
                  <Table.Th>Kontakt</Table.Th>
                  <Table.Th>E-mail</Table.Th>
                  <Table.Th ta="center">Hodinová sazba</Table.Th>
                  <Table.Th ta="center">Sazba za km</Table.Th>
                  <Table.Th ta="center">Paušální služby</Table.Th>
                  <Table.Th ta="center">Stav</Table.Th>
                  <Table.Th ta="right">Akce</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {organizations.map((organization) => {
                  const isHighlighted = highlightedId === organization.id;
                  const serviceCount = organization.services?.filter(
                    (service) => service.isActive !== false,
                  ).length;

                  return (
                    <Table.Tr
                      key={organization.id}
                      id={`organization-${organization.id}`}
                      style={
                        isHighlighted
                          ? { backgroundColor: 'var(--mantine-color-yellow-light)' }
                          : undefined
                      }
                    >
                      <Table.Td>
                        <Text fw={600} c="green">
                          {organization.code ?? '—'}
                        </Text>
                      </Table.Td>
                      <Table.Td>{organization.name}</Table.Td>
                      <Table.Td>{organization.contactPerson ?? '—'}</Table.Td>
                      <Table.Td>{organization.email ?? '—'}</Table.Td>
                      <Table.Td ta="center">
                        {formatCurrency(organization.hourlyRate)} / hod
                      </Table.Td>
                      <Table.Td ta="center">
                        {formatCurrency(organization.kilometerRate)} / km
                      </Table.Td>
                      <Table.Td ta="center">{serviceCount ?? 0}</Table.Td>
                      <Table.Td ta="center">{renderStatusBadge(organization.isActive)}</Table.Td>
                      <Table.Td ta="right">
                        <Group gap="xs" justify="flex-end">
                          <ActionIcon
                            variant="light"
                            onClick={() => handleEdit(organization)}
                            aria-label="Upravit"
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                          <ActionIcon
                            component={Link}
                            href={`/organizations/${organization.id}`}
                            variant="subtle"
                            aria-label="Detail"
                          >
                            <IconEye size={16} />
                          </ActionIcon>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : (
          <Flex align="center" justify="center" py="xl">
            <Text c="dimmed">Zatím nejsou žádné organizace. Přidejte první pomocí tlačítka výše.</Text>
          </Flex>
        )}
      </Card>

      <Modal
        opened={opened}
        onClose={() => {
          setOpened(false);
          setEditing(null);
        }}
        title={editing?.id ? 'Upravit organizaci' : 'Nová organizace'}
        size="lg"
        centered
      >
        <OrganizationForm
          defaultValues={
            editing || {
              name: '',
              code: '',
              contactPerson: '',
              email: '',
              phone: '',
              address: '',
              ico: '',
              dic: '',
              hourlyRate: 0,
              kilometerRate: 0,
              hardwareMarginPct: 0,
              softwareMarginPct: 0,
              outsourcingFee: 0,
              isActive: true,
            }
          }
          onSubmit={handleSubmit}
          isSubmitting={upsertMutation.isPending}
          submitLabel={editing?.id ? 'Uložit změny' : 'Vytvořit organizaci'}
        />
      </Modal>
    </Stack>
  );
}
