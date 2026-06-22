// components/LibraryCell.tsx — 网格卡片(从 tabs/library.tsx 迁出)
import { memo, useMemo, useState } from "react"
import type { MediaItem } from "../types"
import { makeStyles } from "../lib/library-styles"
import { useTheme } from "../lib/use-theme"
import { Icon } from "./Icon"

interface LibraryCellProps {
  item: MediaItem
  selected: boolean
  imageCount?: number
  onPreview: (item: MediaItem) => void
  onToggleSelect: (item: MediaItem) => void
  onDownload: (item: MediaItem) => void
  onOpenSource: (item: MediaItem) => void
}

export const LibraryCell = memo(function LibraryCell({
  item,
  selected,
  imageCount,
  onPreview,
  onToggleSelect,
  onDownload,
  onOpenSource,
}: LibraryCellProps) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [imgError, setImgError] = useState(false)
  const cover = getDisplayCover(item)
  const isVideo = item.type === "video"
  const showCoverImage = cover && !imgError
  const showVideoFrame = isVideo && !cover && !imgError
  const showMultiBadge = !isVideo && imageCount && imageCount > 1
  const platformColor = item.platform === "xiaohongshu" ? theme.xhs : theme.textTertiary

  return (
    <div
      className="mc-library-cell"
      style={{ ...styles.cell, ...(selected ? styles.cellSelected : {}) }}
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
      {showCoverImage ? (
        <img
          src={cover}
          alt=""
          style={styles.cellImage}
          onError={() => setImgError(true)}
        />
      ) : showVideoFrame ? (
        <video
          src={item.url}
          style={styles.cellImage}
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
        <div style={styles.mediaPlaceholder} aria-hidden="true">
          <Icon name={isVideo ? "play" : "image"} size={28} fill={isVideo ? "currentColor" : "none"} />
          <span>{isVideo ? "视频素材" : "图片加载失败"}</span>
        </div>
      )}

      {selected && <div style={styles.cellSelectedFrame} aria-hidden="true" />}

      {showMultiBadge ? (
        <div style={styles.mediaBadge}>
          <Icon name="image" size={12} />
          {imageCount}
        </div>
      ) : (
        <span style={{ ...styles.platformDot, background: platformColor }} />
      )}

      {isVideo && (
        <div style={styles.videoBadge}>
          <Icon name="play" size={12} fill="currentColor" />
        </div>
      )}

      <button
        className="mc-library-button"
        style={styles.previewAction}
        onClick={(e) => {
          e.stopPropagation()
          onPreview(item)
        }}
        aria-label="预览该素材"
        title="预览"
      >
        <Icon name="view" size={14} />
      </button>

      <button
        className="mc-library-check"
        style={{ ...styles.check, ...(selected ? styles.checkActive : {}) }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(item)
        }}
        aria-label={selected ? "取消选择该素材" : "选择该素材"}
        aria-pressed={selected}
      >
        {selected && <Icon name="check" size={13} />}
      </button>

      <div className="mc-library-info" style={styles.cellInfo}>
        <div style={styles.cellAuthor}>@{item.author || "未分类"}</div>
        <div style={styles.cellActions}>
          <button
            style={styles.miniAction}
            onClick={(e) => {
              e.stopPropagation()
              onDownload(item)
            }}
            aria-label="下载该素材"
          >
            <Icon name="download" size={13} />
          </button>
          {item.sourceUrl && (
            <button
              style={styles.miniAction}
              onClick={(e) => {
                e.stopPropagation()
                onOpenSource(item)
              }}
              aria-label="打开原笔记"
            >
              <Icon name="external" size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

function getDisplayCover(item: MediaItem): string {
  if (item.type === "image") return item.url || item.coverUrl || ""
  return item.coverUrl || ""
}
