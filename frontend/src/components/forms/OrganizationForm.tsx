'use client';

import { useEffect } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  Button,
  Group,
  NumberInput,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';

const schema = z.object({
  name: z.string().min(1, 'Název je povinný'),
  code: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email('Neplatný email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  ico: z.string().optional(),
  dic: z.string().optional(),
  hourlyRate: z.number().min(0),
  kilometerRate: z.number().min(0),
  hardwareMarginPct: z.number().min(0).max(100),
  softwareMarginPct: z.number().min(0).max(100),
  outsourcingFee: z.number().min(0),
  isActive: z.boolean().default(true),
});

export type OrganizationFormValues = z.infer<typeof schema>;

export type OrganizationFormProps = {
  defaultValues?: Partial<OrganizationFormValues>;
  onSubmit: (values: OrganizationFormValues) => Promise<void> | void;
  submitLabel?: string;
  isSubmitting?: boolean;
};

export const OrganizationForm = ({
  defaultValues,
  onSubmit,
  submitLabel = 'Uložit organizaci',
  isSubmitting = false,
}: OrganizationFormProps) => {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<OrganizationFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
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
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      (Object.keys(defaultValues) as Array<keyof OrganizationFormValues>).forEach((key) => {
        const value = defaultValues[key];
        if (value !== undefined) {
          setValue(key, value as any);
        }
      });
    }
  }, [defaultValues, setValue]);

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack gap="sm">
        <TextInput label="Název" withAsterisk {...register('name')} error={errors.name?.message} />
        <Group grow align="flex-start">
          <TextInput label="Kód" {...register('code')} error={errors.code?.message} />
          <TextInput
            label="Kontakt"
            {...register('contactPerson')}
            error={errors.contactPerson?.message}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput label="Email" {...register('email')} error={errors.email?.message} />
          <TextInput label="Telefon" {...register('phone')} error={errors.phone?.message} />
        </Group>
        <TextInput label="Adresa" {...register('address')} error={errors.address?.message} />
        <Group grow align="flex-start">
          <TextInput label="IČO" {...register('ico')} error={errors.ico?.message} />
          <TextInput label="DIČ" {...register('dic')} error={errors.dic?.message} />
        </Group>
        <Group grow align="flex-start">
          <Controller
            control={control}
            name="hourlyRate"
            render={({ field }) => (
              <NumberInput
                label="Hodinová sazba (CZK)"
                min={0}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.hourlyRate?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="kilometerRate"
            render={({ field }) => (
              <NumberInput
                label="Sazba za km (CZK)"
                min={0}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.kilometerRate?.message}
              />
            )}
          />
        </Group>
        <Group grow align="flex-start">
          <Controller
            control={control}
            name="hardwareMarginPct"
            render={({ field }) => (
              <NumberInput
                label="Marže HW (%)"
                min={0}
                max={100}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.hardwareMarginPct?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="softwareMarginPct"
            render={({ field }) => (
              <NumberInput
                label="Marže SW (%)"
                min={0}
                max={100}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.softwareMarginPct?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="outsourcingFee"
            render={({ field }) => (
              <NumberInput
                label="Outsourcing (CZK)"
                min={0}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.outsourcingFee?.message}
              />
            )}
          />
        </Group>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <Switch
              label="Aktivní"
              checked={field.value}
              onChange={(event) => field.onChange(event.currentTarget.checked)}
            />
          )}
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
};
