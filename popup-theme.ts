// popup-theme.ts — Apple Music 沉浸风深色主题 token
// 所有 popup 组件共用。严格遵循 d-music.html 定稿的视觉规范。

export const theme = {
  // 表面(深灰双层)
  bg: "#0a0a0c",
  bgGradient: "#1c1c1e",
  card: "rgba(255,255,255,0.08)",
  cardHover: "rgba(255,255,255,0.12)",
  floatBar: "rgba(40,40,42,0.62)",

  // 文字
  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.7)",
  textTertiary: "rgba(255,255,255,0.5)",

  // 强调
  accent: "#ffffff",
  danger: "rgba(255,69,58,0.25)",
  dangerText: "#FF453A",

  // 线条
  hairline: "rgba(255,255,255,0.12)",
  hairlineSoft: "rgba(255,255,255,0.06)",

  // 圆角
  r: { xs: 8, sm: 10, md: 14, lg: 16, xl: 22, pill: 9999 },

  // 磨砂玻璃
  glass: "rgba(255,255,255,0.08)",
  glassBlur: "saturate(180%) blur(20px)",
  glassBlurStrong: "saturate(180%) blur(30px)",

  // 阴影
  shadowCard: "0 8px 20px rgba(0,0,0,0.45)",
  shadowHero: "0 16px 36px rgba(0,0,0,0.5)",
  shadowFloat: "0 16px 40px rgba(0,0,0,0.5)",

  // 动效
  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durFast: "180ms",
  dur: "250ms",
} as const

// 作者头像渐变色板(按 author hash 分配稳定色)
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
