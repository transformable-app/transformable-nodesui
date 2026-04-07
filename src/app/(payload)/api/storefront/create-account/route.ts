import configPromise from '@payload-config'
import { getPayload } from 'payload'

const USER_ROLE_NAME = 'User'

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      email?: unknown
      name?: unknown
      password?: unknown
      passwordConfirm?: unknown
      roles?: unknown
      roleNames?: unknown
    }

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const password = typeof body.password === 'string' ? body.password : ''
    const passwordConfirm = typeof body.passwordConfirm === 'string' ? body.passwordConfirm : ''

    if (!email || !password || !passwordConfirm) {
      return Response.json(
        {
          error: 'email, password, and passwordConfirm are required.',
        },
        { status: 400 },
      )
    }

    if (password !== passwordConfirm) {
      return Response.json({ error: 'Passwords do not match.' }, { status: 400 })
    }

    const payload = await getPayload({ config: configPromise })

    const existing = await payload.find({
      collection: 'roles',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      where: {
        name: {
          equals: USER_ROLE_NAME,
        },
      },
    })

    const userRole = existing.docs[0]

    if (!userRole) {
      return Response.json(
        {
          error: 'User role is missing. Restart the app to run the role initializer.',
        },
        { status: 422 },
      )
    }

    const createdUser = await payload.create({
      collection: 'users',
      data: {
        email,
        name,
        password,
        roles: [userRole.id],
      },
      overrideAccess: true,
    })

    return Response.json(
      {
        message: 'Account created successfully.',
        user: {
          id: createdUser.id,
          email: createdUser.email,
          name: createdUser.name,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create account.'
    return Response.json({ error: message }, { status: 500 })
  }
}
