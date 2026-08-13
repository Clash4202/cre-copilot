'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { THEME_STORAGE_KEY, getNextTheme, type Theme } from '@/lib/theme'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return ctx
}

export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode
  initialTheme: Theme
}) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  function toggleTheme() {
    setTheme((current) => {
      const next = getNextTheme(current)
      // Readable by the server on the next request, so page.tsx renders
      // the correct theme in the first byte of HTML - no boot script or
      // client-side patch needed, and therefore no flash is possible.
      document.cookie = `${THEME_STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div id="landing-root" data-theme={theme} className="bg-paper text-ink min-h-screen">
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
