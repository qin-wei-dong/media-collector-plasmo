// components/Toast.tsx — 底部 Snackbar(支持 action 按钮 + 自动消失)
import { useEffect } from "react"
import { useTheme } from "../lib/use-theme"
import type { ThemeTokens } from "../lib/design-tokens"

interface ToastProps {
  message: string
  /** 右侧操作按钮文案(可选,例如「撤销」) */
  actionLabel?: string
  onAction?: () => void
  /** 自动消失毫秒数,默认 5000 */
  duration?: number
  /** 倒计时进度(0~100),用于底部进度条 */
  progress?: number
  onDismiss: () => void
}

export function Toast({
  message,
  actionLabel,
  onAction,
  duration = 5000,
  progress,
  onDismiss,
}: ToastProps) {
  const theme = useTheme()
  const styles = makeStyles(theme)
  // duration 毫秒后自动消失
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, duration)
    return () => window.clearTimeout(timer)
  }, [duration, onDismiss])

  return (
    <div
      style={styles.toast}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span style={styles.message}>{message}</span>
      {actionLabel && onAction && (
        <button
          style={styles.action}
          onClick={() => {
            onAction()
            onDismiss()
          }}
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      )}
      {/* 倒计时进度条(可选) */}
      {typeof progress === "number" && (
        <div style={styles.progressTrack} aria-hidden="true">
          <div style={{ ...styles.progressFill, width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  )
}

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  toast: {
    position: "absolute",
    bottom: 76, // 浮在 FloatBar 上方
    left: theme.sp.md - 3,
    right: theme.sp.md - 3,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.sp.sm,
    padding: `${theme.sp.sm}px ${theme.sp.md}px`,
    background: "rgba(28,28,30,0.92)",
    backdropFilter: theme.glassBlurStrong,
    WebkitBackdropFilter: theme.glassBlurStrong,
    border: `0.5px solid ${theme.hairline}`,
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: theme.r.md,
    zIndex: 12,
    boxShadow: theme.shadowFloat,
    overflow: "hidden",
    // 入场动画
    animation: "mc-toast-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both",
  },
  message: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  action: {
    border: "none",
    background: "transparent",
    color: theme.accentDark, // accentDark 在深底上更亮
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: `2px ${theme.sp.xs}px`,
    marginRight: -theme.sp.xs,
    fontFamily: "inherit",
    transition: `opacity ${theme.durFast} ease`,
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    background: "rgba(255,255,255,0.08)",
  },
  progressFill: {
    height: "100%",
    background: theme.accent,
    transition: "width 0.1s linear",
  },
})
