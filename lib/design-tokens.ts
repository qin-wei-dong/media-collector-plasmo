// lib/design-tokens.ts — Design tokens 唯一权威源(TS module)
// 之前在 popup-theme.ts;P3-19 迁移到 lib/ 并加 ThemeTokens 接口 + light/dark 双主题。
// 组件通过 useTheme() hook 消费,禁止内联 magic value。

export interface ThemeTokens {
  // ===== 表面 =====
  bg: string
  bgGradient: string
  card: string
  cardHover: string
  floatBar: string

  // ===== 文字 =====
  textPrimary: string
  textSecondary: string
  textTertiary: string

  // ===== 强调(Apple Action Blue) =====
  accent: string
  accentFocus: string
  accentDark: string
  accentLight: string

  // ===== 警示 =====
  danger: string
  dangerBg: string
  dangerText: string

  // ===== 平台品牌色 =====
  xhs: string
  xhsBg: string
  douyin: string
  douyinBg: string

  // ===== 圆角(5 档) =====
  r: { xs: number; sm: number; md: number; lg: number; pill: number }

  // ===== 8pt 间距 =====
  sp: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }

  // ===== 按钮尺寸(4 档) =====
  btn: { xs: number; sm: number; md: number; lg: number }

  // ===== 字号(6 档) =====
  fs: { micro: number; caption: number; body: number; bodyLg: number; title: number; display: number }

  // ===== 磨砂玻璃 =====
  glass: string
  glassBlur: string
  glassBlurStrong: string

  // ===== 阴影 =====
  shadowCard: string
  shadowHero: string
  shadowFloat: string

  // ===== 动效 =====
  easeSpring: string
  easeOut: string
  durFast: string
  dur: string

  // ===== Focus ring(键盘可达性) =====
  focusRing: string
  focusRingOffset: string
}

/**
 * Dark theme — 当前主色,Apple Music 沉浸风深色
 * 所有色值必须与 mockups/tokens.css(若存在)对齐
 */
export const darkTheme: ThemeTokens = {
  bg: "#0a0a0c",
  bgGradient: "#1c1c1e",
  card: "rgba(255,255,255,0.08)",
  cardHover: "rgba(255,255,255,0.12)",
  floatBar: "rgba(40,40,42,0.62)",

  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.7)",
  textTertiary: "rgba(255,255,255,0.5)",

  accent: "#0066cc",
  accentFocus: "#0071e3",
  accentDark: "#2997ff",
  accentLight: "#5AC8FA",

  danger: "#FF453A",
  dangerBg: "rgba(255,69,58,0.16)",
  dangerText: "#FF453A",

  xhs: "#FF2442",
  xhsBg: "rgba(255,36,66,0.16)",
  douyin: "#25F4EE",
  douyinBg: "rgba(37,244,238,0.16)",

  r: { xs: 5, sm: 8, md: 11, lg: 18, pill: 9999 },
  sp: { xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48 },
  btn: { xs: 22, sm: 30, md: 38, lg: 40 },
  fs: { micro: 11, caption: 12, body: 14, bodyLg: 15, title: 17, display: 26 },

  glass: "rgba(255,255,255,0.08)",
  glassBlur: "saturate(180%) blur(20px)",
  glassBlurStrong: "saturate(180%) blur(30px)",

  shadowCard: "0 8px 20px rgba(0,0,0,0.45)",
  shadowHero: "0 16px 36px rgba(0,0,0,0.5)",
  shadowFloat: "0 16px 40px rgba(0,0,0,0.5)",

  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durFast: "180ms",
  dur: "250ms",

  focusRing: "0 0 0 2px #0066cc",
  focusRingOffset: "0 0 0 2px #0066cc, 0 0 0 4px rgba(0,102,204,0.25)",
}

/**
 * Light theme — P3-21 完整填充;P3-19 范围先 fall back 到 darkTheme
 * 留空会让 P3-19 build 通过,但 light 模式实际仍显示 dark(等 P3-21 落地)
 */
export const lightTheme: ThemeTokens = darkTheme

// ===== 头像渐变(不依赖主题,放一起便于维护) =====

export const avatarGradients = [
  "linear-gradient(135deg, #FF5A5F, #FF2D55)",
  "linear-gradient(135deg, #5AC8FA, #007AFF)",
  "linear-gradient(135deg, #AF52DE, #5856D6)",
  "linear-gradient(135deg, #FFD60A, #FF9500)",
  "linear-gradient(135deg, #34C759, #30B0C7)",
  "linear-gradient(135deg, #FF9500, #FF2D55)",
  "linear-gradient(135deg, #5856D6, #BF5AF2)",
  "linear-gradient(135deg, #64D2FF, #007AFF)",
]

/** 给作者名分配稳定的渐变色(同名永远同色) */
export function getAvatarGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0
  }
  return avatarGradients[Math.abs(hash) % avatarGradients.length]
}

// ===== 时间分桶(不依赖主题) =====

/** 时间分组标签 */
export function getTimeBucket(collectedAt: string): string {
  const now = new Date()
  const t = new Date(collectedAt)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart.getTime() - 86400000)
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000)

  if (t >= todayStart) return "今天"
  if (t >= yesterdayStart) return "昨天"
  if (t >= weekStart) return "本周"
  return "更早"
}

/** 时间分段的显示顺序 */
export const TIME_ORDER = ["今天", "昨天", "本周", "更早"]
