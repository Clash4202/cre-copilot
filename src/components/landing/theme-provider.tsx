'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import Script from 'next/script'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  getNextTheme,
  isValidTheme,
  type Theme,
} from '@/lib/theme'

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

// Runs before React hydrates, so a returning visitor who previously chose
// "light" doesn't see a flash of the default dark theme. Dark itself needs
// no boot script since it's already the server-rendered default.
const BOOT_SCRIPT = `(function(){try{var t=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});if(t==='light'){document.getElementById('landing-root').setAttribute('data-theme','light')}}catch(e){}})()`

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (isValidTheme(stored)) {
      // Syncing from localStorage (a client-only external source) after
      // mount is the correct place for this: doing it during the initial
      // render instead (e.g. a useState lazy initializer) makes the
      // client's first render diverge from the server-rendered HTML and
      // breaks hydration — this effect intentionally runs after mount,
      // once hydration is already complete.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTheme(stored)
    }
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next = getNextTheme(current)
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      return next
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {/*
        eslint-disable-next-line @next/next/no-before-interactive-script-outside-document --
        This rule only recognizes the Pages Router's `pages/_document.js` (and
        blanket-skips anything under an `app/` path segment - see
        no-before-interactive-script-outside-document.js in
        @next/eslint-plugin-next, which special-cases app-dir files but has no
        equivalent allowance for a shared component like this one that isn't
        itself under `app/`). `beforeInteractive` is still the correct
        strategy here: it's what makes Next.js queue this script via its own
        `self.__next_s` bootstrap mechanism instead of rendering a plain JSX
        `<script>` node that React would warn about and fail to hydrate
        reliably. Confirmed working with zero console errors in a live
        browser (default theme, 'light' in localStorage, and first-time
        visitor cases) - see task-1-report.md.
      */}
      <Script id="theme-boot-script" strategy="beforeInteractive">
        {BOOT_SCRIPT}
      </Script>
      <div id="landing-root" data-theme={theme} className="bg-paper text-ink" suppressHydrationWarning>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}
