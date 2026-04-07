import type { Form } from '@/payload-types'
import { RequiredDataFromCollectionSlug } from 'payload'

type ContactArgs = {
  contactForm: Form
}

export const contact: (args: ContactArgs) => RequiredDataFromCollectionSlug<'pages'> = ({
  contactForm: _contactForm,
}) => {
  return {
    title: 'Contact',
    slug: 'contact',
    _status: 'published',
    description: 'Contact details and team routing can be added here when this dashboard needs them.',
    hero: {
      type: 'none',
    },
    layout: [],
  }
}
