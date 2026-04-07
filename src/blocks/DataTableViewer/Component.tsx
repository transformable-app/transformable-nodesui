import { ArrowDown, ArrowUp, ArrowUpDown, Database } from 'lucide-react'

import { PageRange } from '@/components/PageRange'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { QueryPagination } from '@/components/QueryPagination'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  getAllDataTableRows,
  getDataTableByID,
  getDataTableRows,
  getRelationName,
  type DataTableRowSortOption,
} from '@/lib/n8n-dashboard'
import { formatDateTime } from '@/n8n/format'

type RelationValue = string | { id?: string; name?: string | null } | null | undefined

type DataTableColumn = {
  displayName?: string | null
  key?: string | null
  label?: string | null
  name?: string | null
}

type SortableRow = {
  id: string
  data?: Record<string, unknown> | null
  rowIndex?: number | null
}

type Props = {
  defaultSort?: DataTableRowSortOption | null
  description?: string | null
  id?: string | null
  pagingMode?: 'pagination' | 'preview' | null
  pageSize?: number | null
  searchParams?: Record<string, string | string[] | undefined>
  table?: RelationValue
  title?: string | null
}

const getCurrentPage = (value: string | string[] | undefined) => {
  const candidate = Array.isArray(value) ? value[0] : value
  const page = Number(candidate)

  return Number.isInteger(page) && page > 0 ? page : 1
}

const getSearchParamValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const getComparableValue = (value: unknown) => {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value instanceof Date) return value.getTime()

  const stringValue = String(value).trim()

  if (!stringValue) return ''

  const numericValue = Number(stringValue)
  if (!Number.isNaN(numericValue) && stringValue === String(numericValue)) {
    return numericValue
  }

  const dateValue = Date.parse(stringValue)
  if (!Number.isNaN(dateValue)) {
    return dateValue
  }

  return stringValue.toLowerCase()
}

const getBooleanDisplay = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase()

    if (normalizedValue === 'true') return true
    if (normalizedValue === 'false') return false
  }

  return null
}

const renderCellValue = (value: unknown) => {
  const booleanValue = getBooleanDisplay(value)

  if (booleanValue != null) {
    return <Badge variant={booleanValue ? 'success' : 'danger'}>{booleanValue ? 'true' : 'false'}</Badge>
  }

  return String(value ?? '—')
}

const sortRows = ({
  direction,
  key,
  rows,
}: {
  direction: 'asc' | 'desc'
  key: string
  rows: SortableRow[]
}) =>
  [...rows].sort((left, right) => {
    const leftValue = getComparableValue(left.data?.[key])
    const rightValue = getComparableValue(right.data?.[key])

    if (leftValue == null && rightValue == null) {
      return (left.rowIndex ?? 0) - (right.rowIndex ?? 0)
    }

    if (leftValue == null) return 1
    if (rightValue == null) return -1

    if (leftValue < rightValue) return direction === 'asc' ? -1 : 1
    if (leftValue > rightValue) return direction === 'asc' ? 1 : -1

    return (left.rowIndex ?? 0) - (right.rowIndex ?? 0)
  })

const filterRows = ({
  columns,
  query,
  rows,
}: {
  columns: DataTableColumn[]
  query: string
  rows: SortableRow[]
}) => {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) return rows

  const columnKeys = columns
    .map((column) => column.name || column.key || null)
    .filter((value): value is string => Boolean(value))

  return rows.filter((row) =>
    columnKeys.some((key) => String(row.data?.[key] ?? '').toLowerCase().includes(normalizedQuery)),
  )
}

const buildSortHref = ({
  blockID,
  columnKey,
  currentDirection,
  currentSortKey,
  pageParam,
  searchParams,
  sortDirectionParam,
  sortParam,
}: {
  blockID?: string | null
  columnKey: string
  currentDirection: 'asc' | 'desc'
  currentSortKey?: string
  pageParam: string
  searchParams?: Record<string, string | string[] | undefined>
  sortDirectionParam: string
  sortParam: string
}) => {
  const params = new URLSearchParams()

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') params.append(key, entry)
      })
      return
    }

    if (typeof value === 'string') {
      params.set(key, value)
    }
  })

  const nextDirection =
    currentSortKey === columnKey && currentDirection === 'asc' ? 'desc' : 'asc'

  params.set(sortParam, columnKey)
  params.set(sortDirectionParam, nextDirection)
  params.delete(pageParam)

  const query = params.toString()
  const hash = blockID ? `#${blockID}` : ''

  return query ? `?${query}${hash}` : hash || '.'
}

const buildHiddenParams = ({
  excludedKeys,
  searchParams,
}: {
  excludedKeys: string[]
  searchParams?: Record<string, string | string[] | undefined>
}) => {
  const excluded = new Set(excludedKeys)
  const entries: Array<{ key: string; value: string }> = []

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (excluded.has(key)) return

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') entries.push({ key, value: entry })
      })
      return
    }

    if (typeof value === 'string') {
      entries.push({ key, value })
    }
  })

  return entries
}

const buildResetHref = ({
  blockID,
  excludedKeys,
  searchParams,
}: {
  blockID?: string | null
  excludedKeys: string[]
  searchParams?: Record<string, string | string[] | undefined>
}) => {
  const params = new URLSearchParams()
  const excluded = new Set(excludedKeys)

  Object.entries(searchParams || {}).forEach(([key, value]) => {
    if (excluded.has(key)) return

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry === 'string') params.append(key, entry)
      })
      return
    }

    if (typeof value === 'string') {
      params.set(key, value)
    }
  })

  const query = params.toString()
  const hash = blockID ? `#${blockID}` : ''

  return query ? `?${query}${hash}` : hash || '.'
}

export async function DataTableViewerBlock({
  defaultSort = 'createdUpdatedDesc',
  description,
  id,
  pagingMode = 'pagination',
  pageSize = 10,
  searchParams,
  table,
  title,
}: Props) {
  const tableID = typeof table === 'string' ? table : table?.id
  if (!tableID) return null

  const dataTable = await getDataTableByID(tableID)
  const columns = (dataTable.columns || []) as DataTableColumn[]
  const blockID = id || tableID
  const queryParam = `tablePage-${blockID}`
  const sortParam = `tableSort-${blockID}`
  const sortDirectionParam = `tableSortDir-${blockID}`
  const searchParam = `tableSearch-${blockID}`
  const currentPage = pagingMode === 'pagination' ? getCurrentPage(searchParams?.[queryParam]) : 1
  const currentSortKey = getSearchParamValue(searchParams?.[sortParam])
  const currentSortDirection =
    getSearchParamValue(searchParams?.[sortDirectionParam]) === 'desc' ? 'desc' : 'asc'
  const currentSearch = getSearchParamValue(searchParams?.[searchParam])?.trim() || ''
  const sortableColumnKeys = new Set(
    columns
      .map((column) => column.name || column.key || null)
      .filter((value): value is string => Boolean(value)),
  )
  const canSortByColumn = currentSortKey && sortableColumnKeys.has(currentSortKey)
  const needsClientSideProcessing = Boolean(canSortByColumn || currentSearch)

  const rowsResult = needsClientSideProcessing
    ? (() => {
        const allRowsPromise = getAllDataTableRows({ sort: defaultSort, tableID })
        return allRowsPromise.then((allRows) => {
          const filteredRows = filterRows({
            columns,
            query: currentSearch,
            rows: allRows,
          })
          const processedRows =
            canSortByColumn
              ? sortRows({
                  direction: currentSortDirection,
                  key: currentSortKey,
                  rows: filteredRows,
                })
              : filteredRows
          const totalDocs = processedRows.length
          const totalPages = Math.max(Math.ceil(totalDocs / (pageSize ?? 10)), 1)
          const page = Math.min(currentPage, totalPages)
          const startIndex = (page - 1) * (pageSize ?? 10)

          return {
            docs: processedRows.slice(startIndex, startIndex + (pageSize ?? 10)),
            page,
            totalDocs,
            totalPages,
          }
        })
      })()
    : getDataTableRows({
        limit: pageSize ?? 10,
        page: currentPage,
        sort: defaultSort,
        tableID,
      })
  const resolvedRowsResult = await rowsResult
  const rows = resolvedRowsResult.docs

  return (
    <section className="space-y-5" id={blockID || undefined}>
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>

      <Card className="bg-card">
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-3 text-lg text-foreground">
              <Database className="h-5 w-5 text-primary" />
              {dataTable.name}
            </CardTitle>
            {dataTable.description ? <p className="mt-2 text-sm text-muted-foreground">{dataTable.description}</p> : null}
          </div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {getRelationName(dataTable.server)} • {dataTable.rowCount || 0} rows • {formatDateTime(dataTable.lastRefreshedAt)}
          </div>
        </CardHeader>
        <CardContent>
          {pagingMode === 'pagination' ? (
            <PageRange
              className="mb-4 text-sm text-muted-foreground"
              collectionLabels={{
                plural: 'Rows',
                singular: 'Row',
              }}
              currentPage={resolvedRowsResult.page}
              limit={pageSize ?? 10}
              totalDocs={resolvedRowsResult.totalDocs}
            />
          ) : null}

          <form action="" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {buildHiddenParams({
              excludedKeys: [queryParam, searchParam],
              searchParams,
            }).map(({ key, value }, index) => (
              <input hidden key={`${key}-${value}-${index}`} name={key} readOnly value={value} />
            ))}
            <Input
              defaultValue={currentSearch}
              name={searchParam}
              placeholder="Search rows"
              type="search"
            />
            <div className="flex gap-2">
              <Button type="submit" variant="outline">
                Filter
              </Button>
              {currentSearch ? (
                <Button asChild variant="ghost">
                  <a
                    href={buildResetHref({
                      blockID,
                      excludedKeys: [queryParam, searchParam],
                      searchParams,
                    })}
                  >
                    Clear
                  </a>
                </Button>
              ) : null}
            </div>
          </form>

          <div className="md:hidden space-y-3">
            {rows.length === 0 ? (
              <div className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
                No matching rows found.
              </div>
            ) : null}
            {rows.map((row) => {
              const record = row.data || {}

              return (
                <div className="rounded-lg border bg-background p-4" key={row.id}>
                  <div className="grid gap-3">
                    {columns.map((column) => {
                      const columnKey =
                        column.name || column.key || column.label || column.displayName || ''

                      return (
                        <div
                          className="grid gap-1 rounded-lg border bg-card px-3 py-2"
                          key={columnKey}
                        >
                          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            {column.displayName || column.label || column.name || column.key}
                          </p>
                          <div className="break-all text-sm text-foreground">
                            {renderCellValue(record[column.name || column.key || ''])}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <ScrollArea className="hidden w-full rounded-lg border md:block">
            <table className="w-full min-w-[720px] table-fixed text-left text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  {columns.map((column) => (
                    <th
                      className="px-4 py-3 font-medium whitespace-normal break-words"
                      key={column.name || column.key || column.label || column.displayName}
                    >
                      {(() => {
                        const columnKey = column.name || column.key || ''
                        const isSortable = Boolean(columnKey)
                        const isActiveSort = currentSortKey === columnKey
                        const label = column.displayName || column.label || column.name || column.key

                        if (!isSortable) return label

                        return (
                          <a
                            className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
                            href={buildSortHref({
                              blockID,
                              columnKey,
                              currentDirection: currentSortDirection,
                              currentSortKey,
                              pageParam: queryParam,
                              searchParams,
                              sortDirectionParam,
                              sortParam,
                            })}
                          >
                            <span>{label}</span>
                            {isActiveSort ? (
                              currentSortDirection === 'asc' ? (
                                <ArrowUp className="h-4 w-4" />
                              ) : (
                                <ArrowDown className="h-4 w-4" />
                              )
                            ) : (
                              <ArrowUpDown className="h-4 w-4 opacity-60" />
                            )}
                          </a>
                        )
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="border-b text-foreground">
                    <td
                      className="px-4 py-6 text-center text-sm text-muted-foreground"
                      colSpan={Math.max(columns.length, 1)}
                    >
                      No matching rows found.
                    </td>
                  </tr>
                ) : null}
                {rows.map((row) => {
                  const record = row.data || {}

                  return (
                    <tr className="border-b text-foreground" key={row.id}>
                      {columns.map((column) => (
                        <td
                          className="px-4 py-3 align-top whitespace-normal break-words"
                          key={column.name || column.key || column.label || column.displayName}
                        >
                          {renderCellValue(record[column.name || column.key || ''])}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollArea>

          {pagingMode === 'pagination' && resolvedRowsResult.totalPages > 1 ? (
            <QueryPagination
              page={resolvedRowsResult.page}
              queryParam={queryParam}
              totalPages={resolvedRowsResult.totalPages}
            />
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}
