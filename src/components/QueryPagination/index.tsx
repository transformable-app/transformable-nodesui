'use client'

import {
  Pagination as PaginationComponent,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { cn } from '@/utilities/ui'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const getHref = ({
  page,
  pathname,
  queryParam,
  searchParams,
}: {
  page: number
  pathname: string
  queryParam: string
  searchParams: URLSearchParams
}) => {
  const params = new URLSearchParams(searchParams.toString())

  if (page <= 1) {
    params.delete(queryParam)
  } else {
    params.set(queryParam, String(page))
  }

  const query = params.toString()

  return query ? `${pathname}?${query}` : pathname
}

export const QueryPagination = ({
  className,
  page,
  queryParam,
  totalPages,
}: {
  className?: string
  page: number
  queryParam: string
  totalPages: number
}) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const hasNextPage = page < totalPages
  const hasPrevPage = page > 1
  const hasExtraPrevPages = page - 1 > 1
  const hasExtraNextPages = page + 1 < totalPages

  return (
    <div className={cn('mt-6', className)}>
      <PaginationComponent>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              disabled={!hasPrevPage}
              onClick={() => {
                router.push(
                  getHref({
                    page: Math.max(page - 1, 1),
                    pathname,
                    queryParam,
                    searchParams,
                  }),
                )
              }}
            />
          </PaginationItem>

          {hasExtraPrevPages ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}

          {hasPrevPage ? (
            <PaginationItem>
              <PaginationLink
                onClick={() => {
                  router.push(
                    getHref({
                      page: page - 1,
                      pathname,
                      queryParam,
                      searchParams,
                    }),
                  )
                }}
              >
                {page - 1}
              </PaginationLink>
            </PaginationItem>
          ) : null}

          <PaginationItem>
            <PaginationLink
              isActive
              onClick={() => {
                router.push(
                  getHref({
                    page,
                    pathname,
                    queryParam,
                    searchParams,
                  }),
                )
              }}
            >
              {page}
            </PaginationLink>
          </PaginationItem>

          {hasNextPage ? (
            <PaginationItem>
              <PaginationLink
                onClick={() => {
                  router.push(
                    getHref({
                      page: page + 1,
                      pathname,
                      queryParam,
                      searchParams,
                    }),
                  )
                }}
              >
                {page + 1}
              </PaginationLink>
            </PaginationItem>
          ) : null}

          {hasExtraNextPages ? (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          ) : null}

          <PaginationItem>
            <PaginationNext
              disabled={!hasNextPage}
              onClick={() => {
                router.push(
                  getHref({
                    page: Math.min(page + 1, totalPages),
                    pathname,
                    queryParam,
                    searchParams,
                  }),
                )
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </PaginationComponent>
    </div>
  )
}
