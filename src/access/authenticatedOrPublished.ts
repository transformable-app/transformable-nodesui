import type { Access } from 'payload'
import { userHasCustomerRole } from './contentManagerRestrictions'

export const authenticatedOrPublished: Access = ({ req: { user } }) => {
  if (user && !userHasCustomerRole(user)) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
