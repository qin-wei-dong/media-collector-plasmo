// components/LibraryRow.tsx — 列表行(从 tabs/library.tsx 迁出)
import { memo, useMemo, useState } from "react"
import { PLATFORM_LABELS, type MediaItem } from "../types"
import { makeStyles } from "../lib/library-styles"
import { useTheme } from "../lib/use-theme"
import { Icon } from "./Icon"

interface LibraryRowProps {
  item: MediaItem
  selected: boolean
  onPreview: (item: MediaItem) => void
  onToggleSelect: (item: MediaItem) => void
}

// M6 Task 3:React.memo 包裹 + callback 接受 item 参数
export const LibraryRow = memo(function LibraryRow({
  item,
  selected,
  onPreview,
  onToggleSelect,
}: LibraryRowProps) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [imgError, setImgError] = useState(false)
  const cover = getDisplayCover(item)
  const isVideo = item.type === "video"
  const showCoverImage = cover && !imgError
  const showVideoFrame = isVideo && !cover && !imgError
  return (
    // M5 Task 4:列表行补 role=button + tabIndex + Enter/Space,与 LibraryCell 一致
    <div
      style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}
      role="button"
      tabIndex={0}
      onClick={() => onToggleSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleSelect(item)
        }
      }}
      aria-label={`${selected ? "取消选择" : "选择"}素材 ${item.title || "未命名素材"}`}
      aria-pressed={selected}
    >
      <button
        type="button"
        style={{ ...styles.rowCheck, ...(selected ? styles.checkActive : {}) }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(item)
        }}
        aria-label={selected ? "取消选择该素材" : "选择该素材"}
      >
        {selected && <Icon name="check" size={13} />}
      </button>
      <button
        style={styles.rowThumbButton}
        onClick={(e) => {
          e.stopPropagation()
          onPreview(item)
        }}
        aria-label="预览该素材"
      >
        {showCoverImage ? (
          <img src={cover} alt="" style={styles.rowThumb} onError={() => setImgError(true)} />
        ) : showVideoFrame ? (
          <video
            src={item.url}
            style={styles.rowThumb}
            muted
            playsInline
            preload="metadata"
            onLoadedMetadata={(e) => {
              const video = e.currentTarget
              if (Number.isFinite(video.duration) && video.duration > 1) video.currentTime = 1
            }}
            onError={() => setImgError(true)}
            aria-hidden="true"
          />
        ) : (
          <div style={styles.rowPlaceholder} aria-hidden="true">
            <Icon name={isVideo ? "play" : "image"} size={17} fill={isVideo ? "currentColor" : "none"} />
          </div>
        )}
      </button>
      <button
        style={styles.rowMeta}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(item)
        }}
      >
        <span style={styles.rowTitle}>{item.title || "未命名素材"}</span>
        <span style={styles.rowSub}>{item.author || "未分类"} · {PLATFORM_LABELS[item.platform]} · {item.type === "video" ? "视频" : "图片"}</span>
      </button>
      <span style={styles.rowDate}>{new Date(item.collectedAt).toLocaleDateString("zh-CN")}</span>
    </div>
  )
})

function getDisplayCover(item: MediaItem): string {
  if (item.type === "image") return item.url || item.coverUrl || ""
  return item.coverUrl || ""
}
