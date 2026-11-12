'use client'

import {
  FieldDescription,
  FieldError,
  FieldLabel,
  JSONField,
  ReactSelect,
  useConfig,
  useField,
  type ReactSelectOption,
} from '@payloadcms/ui'
import type { ComponentProps } from 'react'
import { useEffect, useState } from 'react'

import type { PayloadSite } from '@/payload-types'

type Site = Pick<PayloadSite, 'id' | 'name' | 'slug' | 'allowedCollections' | 'schemaProfile'>
type Binding = Record<string, unknown>
type Option = ReactSelectOption<string>

const isRecord = (value: unknown): value is Binding =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const records = (value: unknown): Binding[] => (Array.isArray(value) ? value.filter(isRecord) : [])
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const string = (value: unknown) => (typeof value === 'string' ? value : '')
const option = (value: string, label = value): Option => ({ label, value })
const options = (values: string[]) =>
  [...new Set(values.filter(Boolean))].map((value) => option(value))

export function OutputBindingField(props: ComponentProps<typeof JSONField>) {
  const { config } = useConfig()
  const { disabled, path, setValue, showError, value } = useField<unknown>({
    potentiallyStalePath: props.path,
  })
  const [sites, setSites] = useState<Site[]>([])
  const [loadStatus, setLoadStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [editJSON, setEditJSON] = useState(false)
  const apiRoute = config.routes.api

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ depth: '0', pagination: 'false', sort: 'name' })
    for (const field of ['name', 'slug', 'allowedCollections', 'schemaProfile']) {
      query.set(`select[${field}]`, 'true')
    }

    void fetch(`${apiRoute}/payload-sites?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load Payload sites.')
        const data = (await response.json()) as { docs: Site[] }
        if (controller.signal.aborted) return
        setSites(data.docs)
        setLoadStatus('loaded')
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus('error')
      })

    return () => controller.abort()
  }, [apiRoute])

  const binding = isRecord(value) ? value : {}
  const siteKey = string(binding.payloadSite)
  const site = sites.find(({ id, slug }) => siteKey === slug || siteKey === String(id))
  const collection = string(binding.collection)
  const profile = isRecord(site?.schemaProfile) ? site.schemaProfile : {}
  const draftCollections = records(profile.collections).filter(
    (entry) =>
      entry.draftSupport === true && site?.allowedCollections?.includes(string(entry.slug)),
  )
  const collectionProfile = draftCollections.find((entry) => entry.slug === collection)
  const operation = string(binding.operation)
  const readOnly = Boolean(disabled || props.readOnly)
  const inputID = `field-${path.replaceAll('.', '__')}`

  const changeSite = (next: string) => {
    if (next === siteKey) return
    setValue(next ? { payloadSite: next, operation: operation || 'create' } : null)
  }

  const changeCollection = (next: string) => {
    if (next === collection) return
    setValue({ payloadSite: siteKey, operation: operation || 'create', collection: next })
  }

  const renderMultiSelect = (
    key: 'allowedFields' | 'allowedBlocks',
    label: string,
    available: string[],
  ) => {
    const selected = strings(binding[key])
    return (
      <div>
        <label className="field-label" htmlFor={`${inputID}-${key}`}>
          {label}
        </label>
        <ReactSelect
          disabled={readOnly || !collectionProfile}
          inputId={`${inputID}-${key}`}
          isMulti
          onChange={(next) => {
            const selectedValues = Array.isArray(next) ? next.map((item) => item.value) : []
            const updated = { ...binding }
            if (selectedValues.length) updated[key] = selectedValues
            else delete updated[key]
            setValue(updated)
          }}
          options={options([...available, ...selected])}
          placeholder="Use site and schema limits"
          value={options(selected)}
        />
      </div>
    )
  }

  return (
    <div className="field-type">
      {editJSON ? (
        <JSONField {...props} />
      ) : (
        <>
          <FieldLabel label={props.field.label || 'Output Binding'} path={path} />
          <FieldError path={path} showError={showError} />
          <div style={{ display: 'grid', gap: 'calc(var(--base) / 2)' }}>
            <div>
              <label className="field-label" htmlFor={`${inputID}-site`}>
                Payload Site
              </label>
              <ReactSelect
                disabled={readOnly || loadStatus !== 'loaded'}
                inputId={`${inputID}-site`}
                isClearable
                isLoading={loadStatus === 'loading'}
                onChange={(next) => changeSite(Array.isArray(next) ? '' : string(next?.value))}
                options={sites.map(({ slug, name }) => option(slug, name))}
                placeholder="Select a Payload site"
                value={siteKey ? option(site?.slug ?? siteKey, site?.name ?? siteKey) : undefined}
              />
            </div>
            {loadStatus === 'error' && (
              <p role="status">Could not load Payload sites. Reload to try again.</p>
            )}
            {site && draftCollections.length === 0 && (
              <p role="status">Sync the site schema and allow a collection that supports drafts.</p>
            )}
            <div>
              <label className="field-label" htmlFor={`${inputID}-collection`}>
                Collection
              </label>
              <ReactSelect
                disabled={readOnly || !draftCollections.length}
                inputId={`${inputID}-collection`}
                onChange={(next) =>
                  changeCollection(Array.isArray(next) ? '' : string(next?.value))
                }
                options={options(draftCollections.map(({ slug }) => string(slug)))}
                placeholder="Select a collection"
                value={collection ? option(collection) : undefined}
              />
            </div>
            <div>
              <label className="field-label" htmlFor={`${inputID}-operation`}>
                Operation
              </label>
              <ReactSelect
                disabled={readOnly || !siteKey}
                inputId={`${inputID}-operation`}
                onChange={(next) => {
                  if (!Array.isArray(next) && next) setValue({ ...binding, operation: next.value })
                }}
                options={[option('create', 'Create draft'), option('update', 'Update draft')]}
                value={
                  operation
                    ? option(operation, operation === 'update' ? 'Update draft' : 'Create draft')
                    : undefined
                }
              />
            </div>
            {renderMultiSelect(
              'allowedFields',
              'Allowed Fields',
              strings(collectionProfile?.fieldPaths),
            )}
            {renderMultiSelect(
              'allowedBlocks',
              'Allowed Blocks',
              records(collectionProfile?.blocks).map(({ slug }) => string(slug)),
            )}
          </div>
          <FieldDescription description={props.field.admin?.description} path={path} />
        </>
      )}
      <button className="btn btn--style-pill" onClick={() => setEditJSON(!editJSON)} type="button">
        {editJSON ? 'Use dropdowns' : 'Advanced JSON'}
      </button>
    </div>
  )
}
