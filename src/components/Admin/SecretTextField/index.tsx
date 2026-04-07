'use client'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  RenderCustomComponent,
  fieldBaseClass,
  useField,
  withCondition,
} from '@payloadcms/ui'
import type { TextFieldClientComponent, Validate } from 'payload'
import React, { useCallback, useState } from 'react'

import './index.scss'

const getStaticText = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value

  if (value && typeof value === 'object' && !React.isValidElement(value)) {
    const translatedValue = Object.values(value).find((entry) => typeof entry === 'string')

    if (typeof translatedValue === 'string') return translatedValue
  }

  return undefined
}

const SecretTextFieldComponent: TextFieldClientComponent = ({
  field,
  field: {
    admin: { autoComplete = 'off', className, description, placeholder, width } = {},
    label,
    localized,
    required,
  },
  path: pathFromProps,
  readOnly,
  validate,
}) => {
  const [isVisible, setIsVisible] = useState(false)

  const memoizedValidate = useCallback(
    ((value, options) => {
      if (typeof validate === 'function') {
        const customValidate = validate as Validate

        return customValidate(value, {
          ...options,
          required,
        })
      }

      if (required && !value) return 'This field is required.'

      return true
    }) satisfies Validate,
    [required, validate],
  )

  const {
    customComponents: { AfterInput, BeforeInput, Description, Error, Label } = {},
    disabled,
    path,
    setValue,
    showError,
    value,
  } = useField<string>({
    potentiallyStalePath: pathFromProps,
    validate: memoizedValidate,
  })

  const isDisabled = readOnly || disabled
  const inputID = `field-${path.replace(/\./g, '__')}`

  return (
    <div
      className={[
        fieldBaseClass,
        'text',
        'secret-text-field',
        className,
        showError && 'error',
        isDisabled && 'read-only',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width }}
    >
      <RenderCustomComponent
        CustomComponent={Label}
        Fallback={<FieldLabel label={label} localized={localized} path={path} required={required} />}
      />
      <div className={`${fieldBaseClass}__wrap`}>
        <RenderCustomComponent
          CustomComponent={Error}
          Fallback={<FieldError path={path} showError={showError} />}
        />
        {BeforeInput}
        <div className="secret-text-field__input-wrap">
          <input
            aria-label={getStaticText(label) || path}
            autoComplete={autoComplete}
            disabled={isDisabled}
            id={inputID}
            name={path}
            onChange={(event) => setValue(event.target.value)}
            placeholder={getStaticText(placeholder)}
            required={required}
            type={isVisible ? 'text' : 'password'}
            value={value || ''}
          />
          <button
            aria-controls={inputID}
            aria-label={isVisible ? 'Hide API Key' : 'Show API Key'}
            className="secret-text-field__toggle"
            disabled={isDisabled}
            onClick={() => setIsVisible((visible) => !visible)}
            type="button"
          >
            {isVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        {AfterInput}
        <RenderCustomComponent
          CustomComponent={Description}
          Fallback={<FieldDescription description={description} path={path} />}
        />
      </div>
    </div>
  )
}

export const SecretTextField = withCondition(SecretTextFieldComponent)
