'use client';

import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  TextInput,
  Textarea,
} from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const timeField = z.union([z.literal(''), z.string().regex(timeRegex, 'Formát HH:MM')]);

const schema = z
  .object({
    organizationId: z.string().min(1, 'Vyberte organizaci'),
    billingOrgId: z.string().optional(),
    worker: z.string().min(1, 'Zadejte jméno technika'),
    description: z.string().min(1, 'Popis je povinný'),
    branch: z.string().optional(),
    projectCode: z.string().optional(),
    date: z.date(),
    minutes: z.number().min(0, 'Minuty musí být nezáporné'),
    kilometers: z.number().min(0, 'Kilometry musí být nezáporné'),
    timeFrom: timeField.optional().default(''),
    timeTo: timeField.optional().default(''),
  })
  .refine(
    (data) => {
      if (data.timeFrom && data.timeTo) {
        return true;
      }
      return data.minutes > 0;
    },
    {
      message: 'Zadejte buď čas od-do, nebo počet minut',
      path: ['minutes'],
    },
  );

export type WorkRecordFormValues = z.infer<typeof schema>;

type Option = { value: string; label: string };

export type WorkRecordFormProps = {
  organizations: Option[];
  onSubmit: (values: WorkRecordFormValues) => Promise<void> | void;
  defaultValues?: Partial<WorkRecordFormValues>;
  isSubmitting?: boolean;
};

export const WorkRecordForm = ({
  organizations,
  onSubmit,
  defaultValues,
  isSubmitting,
}: WorkRecordFormProps) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<WorkRecordFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: '',
      billingOrgId: '',
      worker: '',
      description: '',
      branch: '',
      projectCode: '',
      date: new Date(),
      minutes: 60,
      kilometers: 0,
      timeFrom: '',
      timeTo: '',
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        organizationId: defaultValues.organizationId || '',
        billingOrgId: defaultValues.billingOrgId || '',
        worker: defaultValues.worker || '',
        description: defaultValues.description || '',
        branch: defaultValues.branch || '',
        projectCode: defaultValues.projectCode || '',
        date: defaultValues.date ? new Date(defaultValues.date) : new Date(),
        minutes: defaultValues.minutes ?? 60,
        kilometers: defaultValues.kilometers ?? 0,
        timeFrom: defaultValues.timeFrom || '',
        timeTo: defaultValues.timeTo || '',
      });
    }
  }, [defaultValues, reset]);

  const billingOptions = useMemo(
    () => [{ value: '', label: 'Stejná jako organizace' }, ...organizations],
    [organizations],
  );

  const timeFrom = watch('timeFrom');
  const timeTo = watch('timeTo');

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Stack gap="sm">
        <Controller
          control={control}
          name="organizationId"
          render={({ field }) => (
            <Select
              label="Organizace"
              data={organizations}
              value={field.value}
              onChange={(value) => field.onChange(value || '')}
              withAsterisk
              searchable
              error={errors.organizationId?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="billingOrgId"
          render={({ field }) => (
            <Select
              label="Fakturační organizace"
              data={billingOptions}
              value={field.value || ''}
              onChange={(value) => field.onChange(value || '')}
              searchable
              error={errors.billingOrgId?.message}
            />
          )}
        />
        <Group grow align="flex-start">
          <TextInput label="Technik" withAsterisk {...register('worker')} error={errors.worker?.message} />
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <DateInput
                label="Datum"
                value={field.value}
                onChange={(value) => field.onChange(value || new Date())}
                valueFormat="DD.MM.YYYY"
                withAsterisk
                error={errors.date?.message}
              />
            )}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput label="Pobočka" {...register('branch')} error={errors.branch?.message} />
          <TextInput label="Projekt / zakázka" {...register('projectCode')} error={errors.projectCode?.message} />
        </Group>
        <Group grow align="flex-start">
          <Controller
            control={control}
            name="timeFrom"
            render={({ field }) => (
              <TimeInput
                label="Čas od"
                value={field.value || undefined}
                onChange={(event) => field.onChange(event.currentTarget.value)}
                error={errors.timeFrom?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="timeTo"
            render={({ field }) => (
              <TimeInput
                label="Čas do"
                value={field.value || undefined}
                onChange={(event) => field.onChange(event.currentTarget.value)}
                error={errors.timeTo?.message}
                min={timeFrom || undefined}
              />
            )}
          />
          <Controller
            control={control}
            name="minutes"
            render={({ field }) => (
              <NumberInput
                label="Celkový čas (minuty)"
                min={0}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.minutes?.message}
                description="Zadejte počet minut, pokud nevyplňujete čas od-do"
              />
            )}
          />
        </Group>
        <Textarea
          label="Popis práce"
          minRows={4}
          withAsterisk
          {...register('description')}
          error={errors.description?.message}
        />
        <Group grow align="flex-start">
          <Controller
            control={control}
            name="kilometers"
            render={({ field }) => (
              <NumberInput
                label="Ujeté kilometry"
                min={0}
                value={field.value}
                onChange={(value) => field.onChange(Number(value) || 0)}
                error={errors.kilometers?.message}
              />
            )}
          />
        </Group>
        <Group justify="flex-end" mt="md">
          <Button type="submit" loading={isSubmitting}>
            Uložit záznam
          </Button>
        </Group>
      </Stack>
    </form>
  );
};
