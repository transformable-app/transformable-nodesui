import type { Block } from 'payload'

const nameField = {
  name: 'name',
  type: 'text',
  label: 'Name (lowercase, no special characters)',
  required: true,
} as const

const labelField = {
  name: 'label',
  type: 'text',
  label: 'Label',
  localized: true,
} as const

const requiredField = {
  name: 'required',
  type: 'checkbox',
  label: 'Required',
  defaultValue: true,
} as const

const widthField = {
  name: 'width',
  type: 'number',
  label: 'Field Width (percentage)',
  defaultValue: 100,
} as const

export const recaptchaField: Block = {
  slug: 'recaptcha',
  fields: [
    {
      type: 'row',
      fields: [
        {
          ...nameField,
          admin: {
            width: '50%',
          },
        },
        {
          ...labelField,
          admin: {
            width: '50%',
          },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          ...widthField,
          admin: {
            width: '50%',
          },
        },
        {
          ...requiredField,
          admin: {
            width: '50%',
          },
        },
      ],
    },
    {
      name: 'action',
      type: 'text',
      defaultValue: 'payload_form_submit',
      label: 'Action',
    },
    {
      name: 'scoreThreshold',
      type: 'number',
      defaultValue: 0.5,
      label: 'Minimum Score',
    },
    {
      name: 'errorMessage',
      type: 'text',
      defaultValue: 'reCAPTCHA verification failed. Please try again.',
      label: 'Error Message',
      localized: true,
    },
    {
      name: 'description',
      type: 'ui',
      admin: {
        components: {
          Field: '@/components/FormBuilder/RecaptchaFieldDescription',
        },
      },
    },
  ],
  labels: {
    plural: 'reCAPTCHA Fields',
    singular: 'reCAPTCHA',
  },
}
