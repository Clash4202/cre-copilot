export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'cre-copilot-landing-theme'
export const DEFAULT_THEME: Theme = 'dark'

export function isValidTheme(value: string | null | undefined): value is Theme {
  return value === 'dark' || value === 'light'
}

export function getNextTheme(current: Theme): Theme {
  return current === 'dark' ? 'light' : 'dark'
}

export function resolveTheme(cookieValue: string | undefined): Theme {
  return isValidTheme(cookieValue) ? cookieValue : DEFAULT_THEME
}
