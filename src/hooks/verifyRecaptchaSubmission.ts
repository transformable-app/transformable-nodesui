import { APIError, type CollectionBeforeChangeHook } from 'payload'

type RecaptchaField = {
  action?: string
  blockType: 'recaptcha'
  errorMessage?: string
  name: string
  required?: boolean
  scoreThreshold?: number
}

type SubmissionValue = {
  field: string
  value: unknown
}

type FormWithFields = {
  fields?: Array<{ blockType?: string; name?: string } | RecaptchaField>
}

const formCollectionSlug = 'forms'

const verifyRecaptchaToken = async ({
  ip,
  secret,
  token,
}: {
  ip?: string
  secret: string
  token: string
}) => {
  const params = new URLSearchParams({
    response: token,
    secret,
  })

  if (ip) {
    params.set('remoteip', ip)
  }

  const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    body: params,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new APIError('reCAPTCHA verification failed.', 502)
  }

  const result = (await response.json()) as {
    action?: string
    score?: number
    success?: boolean
  }

  return result
}

export const verifyRecaptchaSubmission: CollectionBeforeChangeHook = async ({ data, req }) => {
  if (!data?.form || !Array.isArray(data.submissionData)) {
    return data
  }

  const form = (await req.payload.findByID({
    collection: formCollectionSlug,
    depth: 0,
    id: data.form,
    req,
  })) as FormWithFields

  const recaptchaFields = (form.fields || []).filter(
    (field): field is RecaptchaField => field?.blockType === 'recaptcha' && typeof field?.name === 'string',
  )

  if (recaptchaFields.length === 0) {
    return data
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY

  if (!secret) {
    throw new APIError('Missing RECAPTCHA_SECRET_KEY server configuration.', 500)
  }

  const submissionData = data.submissionData as SubmissionValue[]
  const ipHeader = req.headers.get('x-forwarded-for')
  const ip = ipHeader?.split(',')[0]?.trim()

  for (const field of recaptchaFields) {
    const match = submissionData.find((entry) => entry.field === field.name)
    const token = typeof match?.value === 'string' ? match.value : ''

    if (!token) {
      if (field.required !== false) {
        throw new APIError(field.errorMessage || 'Please complete the reCAPTCHA challenge.', 400)
      }

      continue
    }

    const verificationResult = await verifyRecaptchaToken({
      ip,
      secret,
      token,
    })

    const expectedAction = field.action || 'payload_form_submit'
    const minimumScore = typeof field.scoreThreshold === 'number' ? field.scoreThreshold : 0.5

    if (
      verificationResult.success !== true ||
      verificationResult.action !== expectedAction ||
      typeof verificationResult.score !== 'number' ||
      verificationResult.score < minimumScore
    ) {
      throw new APIError(field.errorMessage || 'reCAPTCHA verification failed.', 400)
    }
  }

  data.submissionData = submissionData.filter(
    (entry) => !recaptchaFields.some((field) => field.name === entry.field),
  )

  return data
}
