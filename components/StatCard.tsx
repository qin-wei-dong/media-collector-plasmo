// components/StatCard.tsx — 数据看板卡(弹窗 + 库页共用)
import { useTheme } from "../lib/use-theme"
import type { ThemeTokens } from "../lib/design-tokens"

interface StatCardProps {
  /** 主数字(已格式化的字符串,如 "12" / "128") */
  value: string
  /** 数字后缀单位(如 "项" / "位") */
  unit?: string
  /** 卡片标签 */
  label: string
  /** 副信息(如 "↑ 较昨日 +50%" 或 "图 96 · 视频 32") */
  hint?: string
  /** 主数字是否用强调色(用于"今日采集"等正向数据) */
  highlight?: boolean
}

export function StatCard({ value, unit, label, hint, highlight }: StatCardProps) {
  const theme = useTheme()
  const styles = makeStyles(theme)
  return (
    <div style={styles.card}>
      <div style={{ ...styles.value, ...(highlight ? { color: theme.accent } : {}) }}>
        {value}
        {unit && <span style={styles.unit}>{unit}</span>}
      </div>
      <div style={styles.label}>{label}</div>
      {hint && <div style={styles.hint}>{hint}</div>}
    </div>
  )
}

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  card: {
    flex: 1,
    minWidth: 0,
    background: theme.card,
    borderRadius: theme.r.md,
    padding: `${theme.sp.sm}px ${theme.sp.sm + 2}px`,
  },
  value: {
    fontSize: theme.fs.title + 2, // 19px,密集但醒目
    fontWeight: 700,
    letterSpacing: "-0.3px",
    lineHeight: 1.1,
    color: theme.textPrimary,
  },
  unit: {
    fontSize: theme.fs.caption,
    fontWeight: 500,
    color: theme.textTertiary,
    marginLeft: 2,
  },
  label: {
    fontSize: theme.fs.micro,
    color: theme.textTertiary,
    marginTop: 3,
  },
  hint: {
    fontSize: theme.fs.micro,
    color: theme.textSecondary,
    marginTop: 2,
  },
})
