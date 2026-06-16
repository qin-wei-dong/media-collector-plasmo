// components/MediaCard.tsx — 单素材封面卡(点击预览,圆圈选中)
import { useState } from "react"
import type { MediaItem } from "../types"
import { theme } from "../popup-theme"

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  imageCountInNote?: number
  compact?: boolean
  onPreview: () => void
  onToggleSelect: () => void
}

export function MediaCard({
  item,
  selected,
  imageCountInNote,
  compact,
  onPreview,
  onToggleSelect,
}: MediaCardProps) {
  const cover = item.coverUrl || item.url
  const isVideo = item.type === "video"
  const [imgError, setImgError] = useState(false)

  return (
    <div style={styles.card}>
      <div
        className="mc-card-art"
        style={{
          ...styles.art,
          boxShadow: selected
            ? `0 0 0 3px ${theme.accent}, ${theme.shadowCard}`
            : theme.shadowCard,
        }}
        onClick={onPreview}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onPreview()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`预览素材 ${item.title || "未命名"}`}
      >
        {/* 封面图:加载失败露出渐变底 */}
        {!imgError ? (
          <img
            src={cover}
            style={styles.artImg}
            onError={() => setImgError(true)}
            alt=""
          />
        ) : null}

        {/* 视频角标:右下角播放图标 */}
        {isVideo && (
          <div style={styles.videoBadge} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 4 20 12 6 20" />
            </svg>
          </div>
        )}

        {/* 多图计数 */}
        {!isVideo && imageCountInNote && imageCountInNote > 1 && (
          <span style={styles.multiBadge} aria-hidden="true">{imageCountInNote}</span>
        )}

        {/* 选中圆圈(独立点击区,不触发预览) */}
        <button
          style={{ ...styles.selectBtn, ...(selected ? styles.selectBtnActive : {}) }}
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          aria-label={selected ? "取消选择该素材" : "选择该素材"}
          aria-pressed={selected}
        >
          {selected && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      </div>
      <div style={styles.title}>{item.title || "未命名"}</div>
      <div style={styles.meta}>{item.author || "未分类"}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: "100%",
    position: "relative",
  },
  art: {
    width: "100%",
    aspectRatio: "1",
    borderRadius: theme.r.sm,
    position: "relative",
    overflow: "hidden",
    cursor: "pointer",
    transition: `transform ${theme.durFast} ${theme.easeSpring}, box-shadow ${theme.durFast} ${theme.easeOut}`,
    // 渐变底:图片加载失败时作为占位
    background: "linear-gradient(135deg, #2a2a2e 0%, #3a3a3e 50%, #2a2a2e 100%)",
  },
  artImg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  videoBadge: {
    position: "absolute",
    bottom: 7,
    right: 7,
    width: theme.btn.xs,
    height: theme.btn.xs,
    borderRadius: theme.r.pill,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
  },
  multiBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    fontSize: theme.fs.micro,
    fontWeight: 700,
    background: "rgba(0,0,0,0.6)",
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    color: "#fff",
    padding: "2px 7px",
    borderRadius: theme.r.xs,
  },
  selectBtn: {
    position: "absolute",
    top: 7,
    left: 7,
    width: theme.btn.xs,
    height: theme.btn.xs,
    borderRadius: theme.r.pill,
    border: "1.5px solid rgba(255,255,255,0.9)",
    background: "rgba(0,0,0,0.3)",
    padding: 0,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    transition: `all ${theme.durFast} ${theme.easeSpring}`,
  },
  selectBtnActive: {
    background: theme.accent,
    borderColor: "#fff",
  },
  title: {
    fontSize: theme.fs.caption,
    fontWeight: 600,
    marginTop: 7,
    color: theme.textPrimary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    letterSpacing: "-0.1px",
  },
  meta: {
    fontSize: theme.fs.micro,
    color: theme.textTertiary,
    marginTop: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
}
