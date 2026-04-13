'use client'

import type { User } from '@/payload-types'

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'

const apiPath = (path: string): string => `/api${path.startsWith('/') ? path : `/${path}`}`

const readErrorMessage = async (res: Response, fallback: string): Promise<string> => {
  const body = await res.json().catch(() => null)

  if (body && typeof body === 'object') {
    if (
      'errors' in body &&
      Array.isArray(body.errors) &&
      typeof body.errors[0]?.message === 'string'
    ) {
      return body.errors[0].message
    }

    if ('message' in body && typeof body.message === 'string') {
      return body.message
    }

    if ('error' in body && typeof body.error === 'string') {
      return body.error
    }
  }

  return fallback
}

type ResetPassword = (args: {
  password: string
  passwordConfirm: string
  token: string
}) => Promise<void>

type ForgotPassword = (args: { email: string }) => Promise<void>

type Create = (args: { email: string; password: string; passwordConfirm: string }) => Promise<void>

type Login = (args: { email: string; password: string }) => Promise<User>

type Logout = () => Promise<void>

type AuthContext = {
  create: Create
  forgotPassword: ForgotPassword
  login: Login
  logout: Logout
  resetPassword: ResetPassword
  setUser: (user: User | null) => void
  status: 'loggedIn' | 'loggedOut' | undefined
  user?: User | null
}

const Context = createContext({} as AuthContext)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>()

  // used to track the single event of logging in or logging out
  // useful for `useEffect` hooks that should only run once
  const [status, setStatus] = useState<'loggedIn' | 'loggedOut' | undefined>()
  const login = useCallback<Login>(async (args) => {
    try {
      const res = await fetch(apiPath('/users/login'), {
        body: JSON.stringify({
          email: args.email,
          password: args.password,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.ok) {
        const { user } = await res.json()
        setUser(user)
        setStatus('loggedIn')
        return user
      }

      throw new Error(await readErrorMessage(res, `Login failed with status ${res.status}.`))
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'An error occurred while attempting to login.')
    }
  }, [])

  const create = useCallback<Create>(async (args) => {
    try {
      const res = await fetch(apiPath('/storefront/create-account'), {
        body: JSON.stringify({
          email: args.email,
          password: args.password,
          passwordConfirm: args.passwordConfirm,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.ok) {
        await login({ email: args.email, password: args.password })
      } else {
        const error = await res.json().catch(() => null)
        throw new Error(error?.error || 'Unable to create account')
      }
    } catch {
      throw new Error('An error occurred while attempting to create your account.')
    }
  }, [login])

  const logout = useCallback<Logout>(async () => {
    try {
      const res = await fetch(apiPath('/users/logout'), {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.ok) {
        setUser(null)
        setStatus('loggedOut')
      } else {
        throw new Error('An error occurred while attempting to logout.')
      }
    } catch {
      throw new Error('An error occurred while attempting to logout.')
    }
  }, [])

  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch(apiPath('/users/me'), {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'GET',
        })

        if (res.ok) {
          const { user: meUser } = await res.json()
          setUser(meUser || null)
          setStatus(meUser ? 'loggedIn' : undefined)
        } else {
          throw new Error('An error occurred while fetching your account.')
        }
      } catch {
        setUser(null)
        throw new Error('An error occurred while fetching your account.')
      }
    }

    void fetchMe()
  }, [])

  const forgotPassword = useCallback<ForgotPassword>(async (args) => {
    try {
      const res = await fetch(apiPath('/users/forgot-password'), {
        body: JSON.stringify({
          email: args.email,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.ok) {
        const { data, errors } = await res.json()
        if (errors) throw new Error(errors[0].message)
        setUser(data?.loginUser?.user)
      } else {
        throw new Error('Invalid login')
      }
    } catch {
      throw new Error('An error occurred while attempting to login.')
    }
  }, [])

  const resetPassword = useCallback<ResetPassword>(async (args) => {
    try {
      const res = await fetch(apiPath('/users/reset-password'), {
        body: JSON.stringify({
          password: args.password,
          passwordConfirm: args.passwordConfirm,
          token: args.token,
        }),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.ok) {
        const { data, errors } = await res.json()
        if (errors) throw new Error(errors[0].message)
        setUser(data?.loginUser?.user)
        setStatus(data?.loginUser?.user ? 'loggedIn' : undefined)
      } else {
        throw new Error('Invalid login')
      }
    } catch {
      throw new Error('An error occurred while attempting to login.')
    }
  }, [])

  return (
    <Context.Provider
      value={{
        create,
        forgotPassword,
        login,
        logout,
        resetPassword,
        setUser,
        status,
        user,
      }}
    >
      {children}
    </Context.Provider>
  )
}

type UseAuth = () => AuthContext

export const useAuth: UseAuth = () => useContext(Context)
