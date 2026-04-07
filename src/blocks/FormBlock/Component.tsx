import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Form } from '@/payload-types'

import { FormBlockClient } from './Component.client'

type Props = {
  description?: string | null
  form?: string | Form | null
  title?: string | null
}

export async function FormBlock({ description, form, title }: Props) {
  const resolvedForm = await getForm(form)

  if (!resolvedForm) return null

  return (
    <FormBlockClient description={description} form={toClientForm(resolvedForm)} title={title} />
  )
}

const getForm = async (form?: string | Form | null) => {
  if (!form) return null
  if (typeof form === 'object') return form

  const payload = await getPayload({ config: configPromise })

  return payload.findByID({
    collection: 'forms',
    depth: 1,
    id: form,
    overrideAccess: false,
  })
}

const toClientForm = (form: Form) => ({
  confirmationMessage: form.confirmationMessage,
  confirmationType: form.confirmationType,
  fields: form.fields,
  id: form.id,
  redirect: form.redirect,
  submitButtonLabel: form.submitButtonLabel,
  title: form.title,
})
