// lib/use-theme.tsx — React 主题 hook + Provider
// 组件通过 useTheme() 消费当前主题的 token;
// useThemeName() 拿到 themeName + setTheme 用于主题切换 UI。
// P3-19: 仅 dark 主题;P3-21 加 light + 跟随系统。

import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from "react"
import { darkTheme, lightTheme, type ThemeTokens } from "./design-tokens"

export type ThemeName = "dark" | "light"

interface ThemeContextValue {
  theme: ThemeTokens
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface ThemeProviderProps {
  children: ReactNode
  /** 初始主题;P3-21 会从 chrome.storage / matchMedia 注入 */
  initial?: ThemeName
}

export function ThemeProvider({ children, initial = "dark" }: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(initial)
  const theme = themeName === "dark" ? darkTheme : lightTheme

  const toggleTheme = useCallback(() => {
    setThemeName((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeName, setTheme: setThemeName, toggleTheme }),
    [theme, themeName, toggleTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** 取当前主题 token 对象;Provider 外调用时返回 darkTheme(避免崩溃) */
export function useTheme(): ThemeTokens {
  const ctx = useContext(ThemeContext)
  return ctx?.theme ?? darkTheme
}

/** 取当前主题名 + 切换器;Provider 外调用返回默认 dark + noop */
export function useThemeControl(): {
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
  toggleTheme: () => void
} {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return {
      themeName: "dark",
      setTheme: () => {},
      toggleTheme: () => {},
    }
  }
  return { themeName: ctx.themeName, setTheme: ctx.setTheme, toggleTheme: ctx.toggleTheme }
}
