// components/FloatBar.tsx — 深色重度磨砂浮动操作栏
// 删除交互改为:点击立即删除 + 底部 Toast「已删除 N 项」+ 5 秒可撤销(P0-4)
import { useTheme } from "../lib/use-theme"
import type { ThemeTokens } from "../lib/design-tokens"

interface FloatBarProps {
  selectedCount: number
  totalCount: number
  downloading?: boolean
  onDownload: () => void
  onDelete: () => void
  onToggleSelectAll: () => void
}

export function FloatBar({
  selectedCount,
  totalCount,
  downloading,
  onDownload,
  onDelete,
  onToggleSelectAll,
}: FloatBarProps) {
  const theme = useTheme()
  const styles = makeStyles(theme)
  const allSelected = totalCount > 0 && selectedCount >= totalCount
  const nothingSelected = selectedCount === 0

  return (
    <div style={styles.bar}>
      {/* 下载进度条 */}
      {downloading && (
        <div style={styles.progressBar}>
          <div style={styles.progressFill} />
        </div>
      )}
      <div style={styles.pill}>
        <div style={{ ...styles.circle, ...(nothingSelected ? styles.circleIdle : {}) }}>
          {nothingSelected ? "+" : selectedCount}
        </div>
        <span style={styles.text}>
          {nothingSelected ? `共 ${totalCount} 项,点击卡片选择` : `已选 ${selectedCount} 项`}
        </span>
      </div>
      <button
        style={styles.icon}
        onClick={onToggleSelectAll}
        aria-label={allSelected ? "取消全选" : "全选当前结果"}
        title={allSelected ? "取消全选" : "全选"}
      >
        {allSelected ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="6" y="4" width="12" height="16" rx="2" />
            <line x1="10" y1="10" x2="14" y2="14" />
            <line x1="14" y1="10" x2="10" y2="14" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="6" y="4" width="12" height="16" rx="2" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
        )}
      </button>
      <button
        style={{ ...styles.downloadBtn, ...(downloading || nothingSelected ? styles.downloadBtnDisabled : {}) }}
        onClick={onDownload}
        disabled={downloading || nothingSelected}
        aria-label="导出选中素材"
        aria-disabled={downloading || nothingSelected}
        title="导出"
      >
        {downloading ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ animation: "mc-spin 0.8s linear infinite" }}
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        )}
        <span>{downloading ? "导出中" : "导出"}</span>
      </button>
      <button
        style={{ ...styles.icon, ...(nothingSelected ? styles.iconDisabled : styles.iconDanger) }}
        onClick={onDelete}
        disabled={nothingSelected}
        aria-label="删除选中素材"
        aria-disabled={nothingSelected}
        title="删除"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  )
}

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  bar: {
    position: "absolute",
    bottom: 12,
    left: 12,
    right: 12,
    background: theme.floatBar,
    backdropFilter: theme.glassBlurStrong,
    WebkitBackdropFilter: theme.glassBlurStrong,
    border: `0.5px solid ${theme.hairline}`,
    borderRadius: theme.r.lg,
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
    background: `linear-gradient(90deg, ${theme.accent}, ${theme.accentLight})`,
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
    borderRadius: theme.r.pill,
    background: "#fff",
    color: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    transition: `all ${theme.durFast} ease`,
    flexShrink: 0,
  },
  // P2-3: 0 选时用 dashed 描边 + 加号占位,引导用户点击卡片选择
  circleIdle: {
    background: "transparent",
    color: theme.textSecondary,
    border: `1.5px dashed ${theme.hairline}`,
    fontSize: 16,
    fontWeight: 400,
  },
  text: { fontSize: theme.fs.body, color: theme.textSecondary },
  icon: {
    width: theme.btn.md,
    height: theme.btn.md,
    borderRadius: theme.r.pill,
    border: "none",
    background: theme.cardHover,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: "#fff",
    transition: `transform ${theme.durFast} ${theme.easeSpring}, opacity ${theme.durFast} ${theme.easeOut}`,
  },
  // 导出主操作:蓝色实心文字按钮(对齐原型,付费核心操作最显眼)
  downloadBtn: {
    height: theme.btn.md,
    padding: "0 14px",
    borderRadius: theme.r.pill,
    border: "none",
    background: theme.accent,
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 6,
    cursor: "pointer",
    fontSize: theme.fs.caption,
    fontWeight: 600,
    fontFamily: "inherit",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: `transform ${theme.durFast} ${theme.easeSpring}, opacity ${theme.durFast} ${theme.easeOut}`,
  },
  downloadBtnDisabled: { opacity: 0.4, cursor: "default" },
  // 警示底色,让删除按钮即使在 idle 态也有"危险"语义
  iconDanger: { background: theme.dangerBg, color: theme.dangerText },
  iconDisabled: { opacity: 0.4, cursor: "default" },
})
