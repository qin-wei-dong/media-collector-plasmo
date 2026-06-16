// components/FloatBar.tsx — 深色重度磨砂浮动操作栏
import { useState } from "react"
import { theme } from "../popup-theme"

interface FloatBarProps {
  selectedCount: number
  totalCount: number
  downloading?: boolean
  onDownload: () => void
  onDelete: () => void
  onToggleSelectAll: () => void
}

export function FloatBar({ selectedCount, totalCount, downloading, onDownload, onDelete, onToggleSelectAll }: FloatBarProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState(0)
  const allSelected = totalCount > 0 && selectedCount >= totalCount
  const nothingSelected = selectedCount === 0

  const handleDeleteClick = () => {
    if (confirmDelete) {
      onDelete()
      setConfirmDelete(false)
      setDeleteProgress(0)
    } else {
      setConfirmDelete(true)
      setDeleteProgress(100)
      // 3 秒后自动取消确认态（带进度动画）
      const startTime = Date.now()
      const duration = 3000
      const animate = () => {
        const elapsed = Date.now() - startTime
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
        setDeleteProgress(remaining)
        if (remaining > 0) {
          requestAnimationFrame(animate)
        } else {
          setConfirmDelete(false)
        }
      }
      requestAnimationFrame(animate)
    }
  }

  return (
    <div style={styles.bar}>
      {/* 下载进度条 */}
      {downloading && (
        <div style={styles.progressBar}>
          <div style={styles.progressFill} />
        </div>
      )}
      <div style={styles.pill}>
        <div style={{ 
          ...styles.circle, 
          ...(confirmDelete ? styles.circleDanger : {}) 
        }}>
          {confirmDelete ? "!" : selectedCount}
        </div>
        <span style={styles.text}>
          {nothingSelected
            ? `共 ${totalCount} 项`
            : confirmDelete
              ? `确认删除 ${selectedCount} 项？`
              : `已选 ${selectedCount} 项`}
        </span>
        {/* 删除确认进度条 */}
        {confirmDelete && (
          <div style={styles.deleteProgress}>
            <div style={{ 
              ...styles.deleteProgressFill, 
              width: `${deleteProgress}%` 
            }} />
          </div>
        )}
      </div>
      <button
        style={styles.icon}
        onClick={onToggleSelectAll}
        title={allSelected ? "取消全选" : "全选"}
      >
        {allSelected ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="4" width="12" height="16" rx="2" />
            <line x1="10" y1="10" x2="14" y2="14" />
            <line x1="14" y1="10" x2="10" y2="14" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="6" y="4" width="12" height="16" rx="2" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        )}
      </button>
      <button
        style={{ ...styles.icon, ...(downloading || nothingSelected ? styles.iconDisabled : {}) }}
        onClick={onDownload}
        disabled={downloading || nothingSelected}
        title="下载"
      >
        {downloading ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "mc-spin 0.8s linear infinite" }}>
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
      </button>
      <button
        style={{ ...styles.icon, ...(nothingSelected ? styles.iconDisabled : confirmDelete ? styles.iconConfirm : styles.iconDanger) }}
        onClick={handleDeleteClick}
        disabled={nothingSelected}
        title={confirmDelete ? "再次点击确认删除" : "删除"}
      >
        {confirmDelete ? (
          <span style={{ fontSize: 11, fontWeight: 700 }}>确认</span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    background: theme.floatBar,
    backdropFilter: theme.glassBlurStrong,
    WebkitBackdropFilter: theme.glassBlurStrong,
    border: `0.5px solid ${theme.hairline}`,
    borderRadius: theme.r.xl,
    padding: 7,
    display: "flex",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
    boxShadow: theme.shadowFloat,
    overflow: "hidden",
  },
  progressBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    background: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, #007AFF, #5AC8FA)",
    animation: "mc-progress 0.8s ease-in-out infinite",
    width: "30%",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "0 12px",
    flex: 1,
    position: "relative",
  },
  circle: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "#fff",
    color: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    transition: `all ${theme.durFast} ease`,
  },
  circleDanger: {
    background: "#FF453A",
    color: "#fff",
  },
  text: { fontSize: 14, color: theme.textSecondary },
  deleteProgress: {
    position: "absolute",
    bottom: -4,
    left: 12,
    right: 12,
    height: 2,
    background: "rgba(255,69,58,0.2)",
    borderRadius: 1,
  },
  deleteProgressFill: {
    height: "100%",
    background: "#FF453A",
    borderRadius: 1,
    transition: "width 0.1s linear",
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: "50%",
    border: "none",
    background: theme.cardHover,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#fff",
    transition: `transform ${theme.durFast} ${theme.easeSpring}`,
  },
  iconDanger: { background: theme.danger, color: theme.dangerText },
  iconConfirm: { background: "#FF453A", color: "#fff" },
  iconDisabled: { opacity: 0.4, cursor: "default" },
}
