// components/LibraryToast.tsx — 底部 snackbar(从 tabs/library.tsx 迁出)
import { useEffect, useMemo } from "react"
import { makeStyles } from "../lib/library-styles"
import { useTheme } from "../lib/use-theme"
import { Icon } from "./Icon"

export interface Notice {
  message: string
  actionLabel?: string
  onAction?: () => void
  kind?: "success" | "error" | "info"
}

export function LibraryToast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div style={styles.toast} role="status" aria-live="polite">
      <span style={{ ...styles.toastIcon, ...(notice.kind === "error" ? styles.toastIconError : {}) }}>
        <Icon name={notice.kind === "error" ? "trash" : "check"} size={13} />
      </span>
      <span style={styles.toastText}>{notice.message}</span>
      {notice.actionLabel && notice.onAction && (
        <button
          style={styles.toastAction}
          onClick={() => {
            notice.onAction?.()
            onDismiss()
          }}
        >
          {notice.actionLabel}
        </button>
      )}
    </div>
  )
}
