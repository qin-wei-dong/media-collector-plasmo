// popup-theme.ts — Popup 主题 token
// 圆角/spacing/button 档位对齐 mockups/tokens.css (Apple Liquid Glass);
// accent 改为 Action Blue;popup 尺寸(460x660)为产品决策,保留。
// 唯一权威源;禁止在组件里内联 magic value 除非来自此文件。

export const theme = {
  // ===== 表面(深色双层) =====
  bg: "#0a0a0c",
  bgGradient: "#1c1c1e",
  card: "rgba(255,255,255,0.08)",
  cardHover: "rgba(255,255,255,0.12)",
  floatBar: "rgba(40,40,42,0.62)",

  // ===== 文字 =====
  textPrimary: "#ffffff",
  textSecondary: "rgba(255,255,255,0.7)",
  textTertiary: "rgba(255,255,255,0.5)",

  // ===== 强调色(Apple Action Blue,与 mockups/tokens.css 对齐) =====
  accent: "#0066cc",
  accentFocus: "#0071e3",
  accentDark: "#2997ff",
  accentLight: "#5AC8FA", // 用于渐变终点的亮蓝

  // ===== 警示(独立于 accent) =====
  danger: "#FF453A",
  dangerBg: "rgba(255,69,58,0.16)",
  dangerText: "#FF453A",

  // ===== 平台品牌色(P1-3):用于 chip / 卡片角标区分平台 =====
  // 小红书 - 官方红
  xhs: "#FF2442",
  xhsBg: "rgba(255,36,66,0.16)",
  // 抖音 - 选用 cyan(品牌色为黑/粉,在深色 UI 上辨识度不够,改用更亮的 cyan 与小红书区分)
  douyin: "#25F4EE",
  douyinBg: "rgba(37,244,238,0.16)",

  // ===== 线条 =====
  hairline: "rgba(255,255,255,0.12)",
  hairlineSoft: "rgba(255,255,255,0.06)",

  // ===== 圆角(5 档,与 tokens.css 对齐) =====
  r: { xs: 5, sm: 8, md: 11, lg: 18, pill: 9999 },

  // ===== 8pt 间距(与 tokens.css 对齐) =====
  sp: { xxs: 4, xs: 8, sm: 12, md: 17, lg: 24, xl: 32, xxl: 48 },

  // ===== 按钮尺寸(标准 4 档) =====
  btn: { xs: 22, sm: 30, md: 38, lg: 40 },

  // ===== 字号(简化,只列 popup 用到的档) =====
  fs: { micro: 11, caption: 12, body: 14, bodyLg: 15, title: 17, display: 26 },

  // ===== 磨砂玻璃 =====
  glass: "rgba(255,255,255,0.08)",
  glassBlur: "saturate(180%) blur(20px)",
  glassBlurStrong: "saturate(180%) blur(30px)",

  // ===== 阴影 =====
  shadowCard: "0 8px 20px rgba(0,0,0,0.45)",
  shadowHero: "0 16px 36px rgba(0,0,0,0.5)",
  shadowFloat: "0 16px 40px rgba(0,0,0,0.5)",

  // ===== 动效 =====
  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  durFast: "180ms",
  dur: "250ms",

  // ===== Focus ring(P0-5):可见焦点 =====
  focusRing: "0 0 0 2px #0066cc",
  focusRingOffset: "0 0 0 2px #0066cc, 0 0 0 4px rgba(0,102,204,0.25)",
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
