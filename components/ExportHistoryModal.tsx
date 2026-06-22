// components/ExportHistoryModal.tsx — 导出历史 modal(从 tabs/library.tsx 迁出)
import { useEffect, useMemo } from "react"
import type { ExportHistoryEntry, Platform } from "../types"
import { makeStyles } from "../lib/library-styles"
import { useTheme } from "../lib/use-theme"

// M6 Task 4:导出历史 modal
export function ExportHistoryModal({
  history,
  onClose,
  onRetry,
  onClear,
}: {
  history: ExportHistoryEntry[]
  onClose: () => void
  onRetry: (files: Array<{ id?: string; url: string; filename: string; platform?: Platform }>) => void
  onClear: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [onClose])

  // 仅展示最近 10 条
  const recent = history.slice(0, 10)
  const totalFailed = history.reduce((s, h) => s + (h.failedCount || 0), 0)

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div
        style={{ ...styles.dialog, maxWidth: 520, width: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.dialogHead}>
          <div style={styles.dialogTitle}>
            导出历史
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "inherit", opacity: 0.6 }}>
              共 {history.length} 条{totalFailed > 0 ? `, ${totalFailed} 项失败` : ""}
            </span>
          </div>
          <button style={styles.dialogClose} onClick={onClose} aria-label="关闭">×</button>
        </div>

        {recent.length === 0 ? (
          <div style={styles.dialogEmpty}>还没有导出记录</div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1, padding: "0 4px" }}>
            {recent.map((entry) => (
              <div key={entry.id} style={styles.historyItem}>
                <div style={styles.historyItemHead}>
                  <span style={styles.historyTime}>
                    {new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                  <span
                    style={{
                      ...styles.historyStatus,
                      ...(entry.failedCount > 0 ? styles.historyStatusPartial : styles.historyStatusOk),
                    }}
                  >
                    {entry.failedCount > 0 ? `部分失败 ${entry.successCount}/${entry.total}` : `✓ ${entry.total} 项`}
                  </span>
                </div>
                {entry.folders.length > 0 && (
                  <div style={styles.historyFolders}>
                    {entry.folders.map((f) => (
                      <span key={f} style={styles.historyFolder}>📁 {f}</span>
                    ))}
                  </div>
                )}
                {entry.failedFiles && entry.failedFiles.length > 0 && (
                  <div style={styles.historyFailed}>
                    {entry.failedFiles.slice(0, 3).map((f, i) => (
                      <div key={i} style={styles.historyFailedItem}>
                        <span style={styles.historyFailedName}>{f.filename}</span>
                        <span style={styles.historyFailedError}>{f.error}</span>
                      </div>
                    ))}
                    {entry.failedFiles.length > 3 && (
                      <div style={styles.historyFailedMore}>还有 {entry.failedFiles.length - 3} 项失败…</div>
                    )}
                    <button
                      className="mc-library-button"
                      style={styles.historyRetryBtn}
                      onClick={() => onRetry(entry.failedFiles!)}
                    >
                      重试失败项
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ ...styles.dialogActions, padding: "12px 0 0", borderTop: `0.5px solid ${theme.hairline}` }}>
            <button
              className="mc-library-button"
              style={styles.dialogGhost}
              onClick={() => {
                if (window.confirm(`清空所有 ${history.length} 条导出历史?此操作不可撤销。`)) {
                  onClear()
                }
              }}
            >
              清空历史
            </button>
            <button className="mc-library-button" style={styles.dialogPrimary} onClick={onClose}>
              关闭
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
