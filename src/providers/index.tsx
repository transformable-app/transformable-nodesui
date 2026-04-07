import React from 'react'
import { AuthProvider } from '@/providers/Auth'
import { SonnerProvider } from '@/providers/Sonner'

import { HeaderThemeProvider } from './HeaderTheme'
import { ThemeProvider } from './Theme'

export const Providers: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <HeaderThemeProvider>
          <SonnerProvider />
          {children}
        </HeaderThemeProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
