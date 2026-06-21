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

  // ===== 圆角(5 档) =====
  r: { xs: number; sm: number; md: number; lg: number; pill: number }

  // ===== 8pt 间距 =====
  sp: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number }

  // ===== 按钮尺寸(4 档) =====
  btn: { xs: number; sm: number; md: number; lg: number }

  // ===== 字号(6 档) =====
  fs: { micro: number; caption: number; body: number; bodyLg: number; title: number; display: number }

  // ===== 分割线 =====
  hairline: string
  hairlineSoft: string

  // ===== 磨砂玻璃 =====
  glass: string
  glassBlur: string
  glassBlurStrong: string

  // ===== 阴影 =====
  shadowCard: string
  shadowFloat: string

  // ===== 动效 =====
  easeSpring: string
  easeOut: string
  durFast: string
  dur: string

  // ===== Focus ring(键盘可达性) =====
  focusRing: string
  focusRingOffset: string

  // ===== 氛围背景(顶部 radial 渐变,与浮层/玻璃视觉协调) =====
  ambient: string
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

  accent: "#0a84ff", // 受控偏离:更活泼的系统蓝(产品决策,见设计文档 §4)
  accentFocus: "#409cff", // focus 态再亮一档
  accentDark: "#2997ff",
  accentLight: "#5AC8FA",

  danger: "#FF453A",
  dangerBg: "rgba(255,69,58,0.16)",
  dangerText: "#FF453A",

  xhs: "#FF2442",
  xhsBg: "rgba(255,36,66,0.16)",

  r: { xs: 5, sm: 8, md: 11, lg: 18, pill: 9999 },
  sp: { xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48 },
  btn: { xs: 22, sm: 30, md: 38, lg: 40 },
  fs: { micro: 11, caption: 12, body: 14, bodyLg: 15, title: 17, display: 26 },

  hairline: "rgba(255,255,255,0.08)",
  hairlineSoft: "rgba(255,255,255,0.05)",

  glass: "rgba(255,255,255,0.08)",
  glassBlur: "saturate(180%) blur(20px)",
  glassBlurStrong: "saturate(180%) blur(30px)",

  shadowCard: "0 8px 20px rgba(0,0,0,0.45)",
  shadowFloat: "0 16px 40px rgba(0,0,0,0.5)",

  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durFast: "180ms",
  dur: "250ms",

  focusRing: "0 0 0 2px #0a84ff",
  focusRingOffset: "0 0 0 2px #0a84ff, 0 0 0 4px rgba(10,132,255,0.25)",

  // 深色氛围:从顶部散出红 + 紫双色调,与浮层/玻璃视觉协调
  ambient:
    "radial-gradient(ellipse 70% 45% at 30% 0%, rgba(255,90,95,0.22), transparent 60%)," +
    "radial-gradient(ellipse 65% 55% at 85% 25%, rgba(120,80,255,0.18), transparent 55%)," +
    "linear-gradient(180deg, #0a0a0c 0%, #1c1c1e 100%)",
}

/**
 * Light theme — Apple 暖白 + 浅灰,Apple Music 风格
 * 阴影更轻,玻璃背景近白,文字反相
 */
export const lightTheme: ThemeTokens = {
  bg: "#ffffff",
  bgGradient: "#f5f5f7",
  card: "rgba(0,0,0,0.04)",
  cardHover: "rgba(0,0,0,0.08)",
  floatBar: "rgba(255,255,255,0.72)",

  textPrimary: "#1d1d1f",
  textSecondary: "rgba(0,0,0,0.6)",
  textTertiary: "rgba(0,0,0,0.4)",

  accent: "#0a84ff", // 受控偏离:与 dark 统一(产品决策,见设计文档 §4)
  accentFocus: "#0071e3", // 亮底保留稍深 focus,保证对比
  accentDark: "#0058a6", // 深色文字版,浅色背景下够暗
  accentLight: "#5AC8FA",

  danger: "#FF3B30",
  dangerBg: "rgba(255,59,48,0.10)",
  dangerText: "#D70015",

  xhs: "#FF2442",
  xhsBg: "rgba(255,36,66,0.10)",

  r: { xs: 5, sm: 8, md: 11, lg: 18, pill: 9999 },
  sp: { xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48 },
  btn: { xs: 22, sm: 30, md: 38, lg: 40 },
  fs: { micro: 11, caption: 12, body: 14, bodyLg: 15, title: 17, display: 26 },

  hairline: "rgba(0,0,0,0.08)",
  hairlineSoft: "rgba(0,0,0,0.05)",

  glass: "rgba(255,255,255,0.6)",
  glassBlur: "saturate(180%) blur(20px)",
  glassBlurStrong: "saturate(180%) blur(30px)",

  shadowCard: "0 4px 14px rgba(0,0,0,0.08)",
  shadowFloat: "0 8px 24px rgba(0,0,0,0.10)",

  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durFast: "180ms",
  dur: "250ms",

  focusRing: "0 0 0 2px #0a84ff",
  focusRingOffset: "0 0 0 2px #0a84ff, 0 0 0 4px rgba(10,132,255,0.25)",

  // 浅色氛围:同色系 radial gradient 但透明度大幅降低(避免在白底上过艳)
  ambient:
    "radial-gradient(ellipse 70% 45% at 30% 0%, rgba(255,90,95,0.06), transparent 60%)," +
    "radial-gradient(ellipse 65% 55% at 85% 25%, rgba(120,80,255,0.05), transparent 55%)," +
    "linear-gradient(180deg, #ffffff 0%, #f5f5f7 100%)",
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
