// components/EmptyState.tsx — 三步图示空状态
import { useTheme } from "../lib/use-theme"
import type { ThemeTokens } from "../lib/design-tokens"

export function EmptyState() {
  const theme = useTheme()
  const styles = makeStyles(theme)
  return (
    <div style={styles.empty}>
      <div style={styles.illust}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
      <div style={styles.title}>还没有采集的素材</div>
      <div style={styles.sub}>
        采集小红书、抖音的图片和视频
        <br />
        它们会出现在这里
      </div>

      <div style={styles.steps}>
        <Step
          num="1"
          gradient="linear-gradient(135deg, #FF5A5F, #FF2D55)"
          title="打开笔记"
          desc="在小红书或抖音点开任意一篇笔记"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 2h6a2 2 0 0 1 2 2v1h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2V4a2 2 0 0 1 2-2z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          }
        />
        <Step
          num="2"
          gradient="linear-gradient(135deg, #5AC8FA, #007AFF)"
          title="点击采集按钮"
          desc="在素材左上角找到「采集素材」按钮"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          }
        />
        <Step
          num="3"
          gradient="linear-gradient(135deg, #AF52DE, #5856D6)"
          title="回到这里查看"
          desc="所有采集的素材都会出现在此页面"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
        />
      </div>

      {/* 快捷键提示 */}
      <div style={styles.shortcutHint}>
        <span style={styles.shortcutText}>快捷键：</span>
        <kbd style={styles.kbd}>Ctrl</kbd>
        <span style={styles.shortcutPlus}>+</span>
        <kbd style={styles.kbd}>Shift</kbd>
        <span style={styles.shortcutPlus}>+</span>
        <kbd style={styles.kbd}>S</kbd>
        <span style={styles.shortcutDesc}> 快速采集</span>
      </div>
    </div>
  )
}

function Step({
  num,
  gradient,
  title,
  desc,
  icon,
}: {
  num: string
  gradient: string
  title: string
  desc: string
  icon: React.ReactNode
}) {
  const theme = useTheme()
  const stylesLocal = makeStylesLocal(theme)
  return (
    <div style={stylesLocal.step}>
      <div style={{ ...stylesLocal.stepNum, backgroundImage: gradient }}>{icon}</div>
      <div style={stylesLocal.stepText}>
        <div style={stylesLocal.stepTitle}>{title}</div>
        <div style={stylesLocal.stepDesc}>{desc}</div>
      </div>
      <span style={stylesLocal.stepBadge}>{num}</span>
    </div>
  )
}

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: `${theme.sp.lg}px 28px`,
    textAlign: "center",
  },
  illust: {
    width: 72,
    height: 72,
    borderRadius: theme.r.md,
    background: theme.card,
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    border: `0.5px solid ${theme.hairline}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: `0 auto ${theme.sp.md}px`,
    color: theme.textSecondary,
  },
  title: { fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", marginBottom: 6 },
  sub: { fontSize: 13, color: theme.textTertiary, marginBottom: theme.sp.lg, lineHeight: 1.5 },
  steps: { display: "flex", flexDirection: "column", gap: theme.sp.sm },
  shortcutHint: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: theme.sp.lg,
    padding: `10px ${theme.sp.sm + 2}px`,
    background: theme.card,
    borderRadius: theme.r.sm,
    border: `0.5px solid ${theme.hairlineSoft}`,
  },
  shortcutText: {
    fontSize: theme.fs.caption,
    color: theme.textTertiary,
    marginRight: 4,
  },
  shortcutPlus: {
    fontSize: theme.fs.micro,
    color: theme.textTertiary,
  },
  shortcutDesc: {
    fontSize: theme.fs.caption,
    color: theme.textTertiary,
    marginLeft: 4,
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 24,
    height: 22,
    padding: "0 6px",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    fontSize: theme.fs.micro,
    fontFamily: "inherit",
    color: theme.textSecondary,
  },
})

const makeStylesLocal = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  step: { display: "flex", alignItems: "center", gap: theme.sp.sm },
  stepNum: {
    width: theme.btn.lg,
    height: theme.btn.lg,
    borderRadius: theme.r.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepText: { flex: 1, textAlign: "left" },
  stepTitle: { fontSize: theme.fs.body, fontWeight: 600, marginBottom: 1 },
  stepDesc: { fontSize: theme.fs.caption, color: theme.textTertiary, lineHeight: 1.4 },
  stepBadge: { fontSize: theme.fs.micro, fontWeight: 700, color: "rgba(255,255,255,0.35)" },
})
