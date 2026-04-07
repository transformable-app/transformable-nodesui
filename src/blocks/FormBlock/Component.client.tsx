'use client'

import RichText from '@/components/RichText'
import { FormError } from '@/components/forms/FormError'
import { FormItem } from '@/components/forms/FormItem'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Form } from '@/payload-types'
import { cn } from '@/utilities/ui'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'

type FormField = NonNullable<Form['fields']>[number]
type FormValues = Record<string, string | boolean | number | null | undefined>
type ClientForm = Pick<
  Form,
  | 'confirmationMessage'
  | 'confirmationType'
  | 'fields'
  | 'id'
  | 'redirect'
  | 'submitButtonLabel'
  | 'title'
>

type Props = {
  description?: string | null
  form: ClientForm
  title?: string | null
}

export function FormBlockClient({ description, form, title }: Props) {
  const router = useRouter()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
  } = useForm<FormValues>({
    defaultValues: getDefaultValues(form.fields),
  })

  const onSubmit = useCallback(
    async (values: FormValues) => {
      setSubmitError(null)

      const response = await fetch('/api/form-submissions', {
        body: JSON.stringify({
          form: form.id,
          submissionData: getSubmissionData(form.fields, values),
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (!response.ok) {
        setSubmitError('There was a problem submitting the form. Please try again.')
        return
      }

      if (form.confirmationType === 'redirect' && form.redirect?.url) {
        router.push(form.redirect.url)
        return
      }

      reset(getDefaultValues(form.fields))
      setSubmitted(true)
    },
    [form, reset, router],
  )

  if (submitted) {
    return (
      <section className="space-y-5">
        <BlockHeader description={description} title={title || form.title} />
        <div className="rounded-lg border border-border bg-background p-6">
          {form.confirmationMessage ? (
            <RichText
              data={form.confirmationMessage as never}
              enableGutter={false}
              enableProse={true}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Thanks. Your submission was received.</p>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-5">
      <BlockHeader description={description} title={title || form.title} />

      <form
        className="rounded-lg border border-border bg-background p-6"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div className="flex flex-wrap gap-y-5 -mx-2">
          {(form.fields || []).map((field) => (
            <Field
              error={errors[getFieldName(field)]?.message as string | undefined}
              field={field}
              key={field.id || getFieldName(field)}
              register={register}
            />
          ))}
        </div>

        {submitError ? <FormError className="mt-5" message={submitError} /> : null}

        <div className="mt-6">
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Submitting' : form.submitButtonLabel || 'Submit'}
          </Button>
        </div>
      </form>
    </section>
  )
}

function BlockHeader({
  description,
  title,
}: {
  description?: string | null
  title?: string | null
}) {
  if (!title && !description) return null

  return (
    <div className="space-y-2">
      {title ? (
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
      ) : null}
      {description ? (
        <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}

function Field({
  error,
  field,
  register,
}: {
  error?: string
  field: FormField
  register: ReturnType<typeof useForm<FormValues>>['register']
}) {
  if (field.blockType === 'message') {
    return (
      <div className="w-full px-2">
        {field.message ? (
          <RichText data={field.message as never} enableGutter={false} enableProse={true} />
        ) : null}
      </div>
    )
  }

  const name = getFieldName(field)
  const label = field.label || name
  const requiredMessage = field.required ? `${label} is required.` : false
  const width = typeof field.width === 'number' && field.width > 0 ? field.width : 100

  return (
    <div className="px-2" style={{ width: `${Math.min(width, 100)}%` }}>
      <FormItem>
        <Label htmlFor={name}>
          {label}
          {field.required ? <span className="text-destructive"> *</span> : null}
        </Label>

        {field.blockType === 'textarea' ? (
          <Textarea
            id={name}
            {...register(name, {
              required: requiredMessage,
            })}
          />
        ) : null}

        {field.blockType === 'select' ? (
          <select
            className={cn(
              'flex h-10 w-full rounded border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            )}
            id={name}
            {...register(name, {
              required: requiredMessage,
            })}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {(field.options || []).map((option) => (
              <option key={option.id || option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}

        {field.blockType === 'checkbox' ? (
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <input
              className="h-4 w-4 rounded border-border accent-primary"
              id={name}
              type="checkbox"
              {...register(name, {
                required: requiredMessage,
              })}
            />
            <span>{field.defaultValue ? 'Enabled' : 'Check to confirm'}</span>
          </label>
        ) : null}

        {['country', 'email', 'number', 'state', 'text'].includes(field.blockType) ? (
          <Input
            id={name}
            type={
              field.blockType === 'email'
                ? 'email'
                : field.blockType === 'number'
                  ? 'number'
                  : 'text'
            }
            {...register(name, {
              required: requiredMessage,
            })}
          />
        ) : null}

        {error ? <FormError message={error} /> : null}
      </FormItem>
    </div>
  )
}

function getFieldName(field: FormField) {
  return 'name' in field ? field.name : field.id || ''
}

function getDefaultValues(fields: Form['fields']) {
  return (fields || []).reduce<FormValues>((values, field) => {
    if (!('name' in field)) return values

    if (field.blockType === 'checkbox') {
      values[field.name] = Boolean(field.defaultValue)
      return values
    }

    if ('defaultValue' in field) {
      values[field.name] = field.defaultValue ?? ''
      return values
    }

    values[field.name] = ''
    return values
  }, {})
}

function getSubmissionData(fields: Form['fields'], values: FormValues) {
  return (fields || [])
    .filter((field): field is Extract<FormField, { name: string }> => 'name' in field)
    .map((field) => {
      const value = values[field.name]

      return {
        field: field.name,
        value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? ''),
      }
    })
    .filter((entry) => entry.value.length > 0)
}
