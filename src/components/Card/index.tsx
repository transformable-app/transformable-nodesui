'use client'
import { cn } from '@/utilities/ui'
import useClickableCard from '@/utilities/useClickableCard'
import Link from 'next/link'
import React from 'react'

import type { Media as MediaType } from '@/payload-types'

import { Media } from '@/components/Media'

export type CardDocData = {
  meta?: {
    description?: string | null
    image?: MediaType | string | number | null
  } | null
  slug?: string | null
  title?: string | null
}

export const Card: React.FC<{
  className?: string
  doc?: CardDocData
  title?: string
}> = ({ className, doc, title: titleFromProps }) => {
  const { card, link } = useClickableCard({})

  const slug = doc?.slug
  const title = titleFromProps || doc?.title
  const description = doc?.meta?.description?.replace(/\s/g, ' ')
  const imageToUse = doc?.meta?.image as MediaType | string | number | null | undefined
  const href = slug === 'home' ? '/' : `/${slug ?? ''}`

  return (
    <article
      className={cn('border border-border rounded-lg overflow-hidden bg-card hover:cursor-pointer', className)}
      ref={card.ref}
    >
      <div className="relative w-full">
        {!imageToUse && <div>No image</div>}
        {imageToUse && typeof imageToUse === 'object' && (
          <Media resource={imageToUse as MediaType | number} size="33vw" />
        )}
      </div>
      <div className="p-4">
        {title && (
          <div className="prose">
            <h3>
              <Link className="not-prose" href={href} ref={link.ref}>
                {title}
              </Link>
            </h3>
          </div>
        )}
        {description && (
          <div className="mt-2">
            <p>{description}</p>
          </div>
        )}
      </div>
    </article>
  )
}
