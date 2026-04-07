declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PAYLOAD_SECRET: string
      DATABASE_URL: string
      NEXT_PUBLIC_SERVER_URL: string
      NEXT_PUBLIC_RECAPTCHA_SITE_KEY?: string
      RECAPTCHA_SECRET_KEY?: string
      VERCEL_PROJECT_PRODUCTION_URL: string
    }
  }

  interface Window {
    grecaptcha?: {
      execute?: (siteKey: string, options: { action: string }) => Promise<string>
      ready: (callback: () => void) => void
      render?: (
        container: HTMLElement,
        parameters: {
          callback?: (token: string) => void
          sitekey: string
          size?: 'compact' | 'normal'
          theme?: 'dark' | 'light'
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => number
      reset?: (widgetId?: number) => void
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {}
