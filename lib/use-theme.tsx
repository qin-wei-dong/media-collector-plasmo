// lib/use-theme.tsx — React 主题 hook + Provider(P3-21)
// 三态:auto(跟随系统) / dark / light;用户选择持久化到 chrome.storage;
// 系统主题变化时 auto 模式自动跟随。

import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from "react"
import { darkTheme, lightTheme, type ThemeTokens } from "./design-tokens"

/** 用户选择的主题模式 */
export type ThemeMode = "auto" | "dark" | "light"

/** 实际生效的主题(auto 模式下从系统解析得到) */
export type ThemeName = "dark" | "light"

interface ThemeContextValue {
  theme: ThemeTokens
  mode: ThemeMode
  themeName: ThemeName
  setMode: (mode: ThemeMode) => void
  cycleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = "theme_mode"
const MEDIA_QUERY = "(prefers-color-scheme: dark)"

/** 读取系统偏好(P3-21:SSR/测试环境下 window 可能没有 matchMedia,降级到 dark) */
function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true
  return window.matchMedia(MEDIA_QUERY).matches
}

/** 把 mode 解析成实际生效的 themeName */
function resolveThemeName(mode: ThemeMode, systemDark: boolean): ThemeName {
  if (mode === "auto") return systemDark ? "dark" : "light"
  return mode
}

interface ThemeProviderProps {
  children: ReactNode
  /** 测试 / 调试用:跳过 chrome.storage,直接给定初始 mode */
  initial?: ThemeMode
}

export function ThemeProvider({ children, initial }: ThemeProviderProps) {
  // 初始 system 偏好(SSR / popup 打开瞬间)
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemPrefersDark())
  // 用户 mode 偏好
  const [mode, setModeState] = useState<ThemeMode>(initial ?? "auto")

  // 启动时:从 chrome.storage 读取用户上次的 mode
  useEffect(() => {
    if (initial) return
    try {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        const saved = result?.[STORAGE_KEY] as ThemeMode | undefined
        if (saved === "auto" || saved === "dark" || saved === "light") {
          setModeState(saved)
        }
      })
    } catch {
      // 非扩展环境(测试)忽略
    }
  }, [initial])

  // 监听系统主题变化(auto 模式下需要实时跟随)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia(MEDIA_QUERY)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  // setMode 包装:写状态 + 持久化
  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    try {
      chrome.storage.local.set({ [STORAGE_KEY]: next })
    } catch {
      // ignore
    }
  }, [])

  // cycleMode:auto → dark → light → auto
  const cycleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "auto" ? "dark" : prev === "dark" ? "light" : "auto"
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: next })
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  const themeName = resolveThemeName(mode, systemDark)
  const theme = themeName === "dark" ? darkTheme : lightTheme

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, themeName, setMode, cycleMode }),
    [theme, mode, themeName, setMode, cycleMode]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** 取当前主题 token 对象;Provider 外调用时返回 darkTheme(避免崩溃) */
export function useTheme(): ThemeTokens {
  const ctx = useContext(ThemeContext)
  return ctx?.theme ?? darkTheme
}

/** 取主题控制(用户 mode + 实际 themeName + 切换函数) */
export function useThemeControl(): {
  mode: ThemeMode
  themeName: ThemeName
  setMode: (mode: ThemeMode) => void
  cycleMode: () => void
} {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    return { mode: "auto", themeName: "dark", setMode: () => {}, cycleMode: () => {} }
  }
  return { mode: ctx.mode, themeName: ctx.themeName, setMode: ctx.setMode, cycleMode: ctx.cycleMode }
}
