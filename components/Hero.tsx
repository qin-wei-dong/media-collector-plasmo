// components/Hero.tsx — Hero 精选大卡(最新采集的笔记)
import { useState } from "react"
import type { MediaItem } from "../types"
import { useTheme } from "../lib/use-theme"

interface HeroProps {
  item: MediaItem
  count: number
  onClick?: () => void
  /** P1-1: 下载当前素材(图集则下载整组) */
  onDownload?: (e: React.MouseEvent) => void
  /** P1-1: 打开原帖 */
  onOpenSource?: (e: React.MouseEvent) => void
}

export function Hero({ item, count, onClick, onDownload, onOpenSource }: HeroProps) {
  const theme = useTheme()
  const cover = item.coverUrl || item.url
  const isVideo = item.type === "video"
  const [imgError, setImgError] = useState(false)
  const hasSource = !!item.sourceUrl

  return (
    <div style={styles.wrap}>
      <div
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick?.()
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`预览素材 ${item.title || "未命名素材"}`}
        style={styles.hero}
      >
        {/* 封面图:加载失败则隐藏,露出渐变底 */}
        {!imgError && (
          <img
            src={cover}
            style={styles.img}
            onError={() => setImgError(true)}
            alt=""
          />
        )}
        <div style={styles.overlay} />

        {/* P1-1: 快速操作(右上角,玻璃质感) */}
        {(onDownload || hasSource) && (
          <div style={styles.actions}>
            {onDownload && (
              <button
                style={styles.actionBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onDownload(e)
                }}
                aria-label="下载此素材"
                title={count > 1 ? `下载全部 ${count} 张` : "下载"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            )}
            {hasSource && onOpenSource && (
              <button
                style={styles.actionBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenSource(e)
                }}
                aria-label="打开原帖"
                title="打开原帖"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div style={styles.info}>
          <span style={styles.tag}>
            <span style={styles.dot} />
            最近采集
          </span>
          <div style={styles.title}>{item.title || "未命名素材"}</div>
          <div style={styles.meta}>
            {item.author ? `${item.author} · ` : ""}
            {isVideo ? "视频" : count > 1 ? `图集 ${count} 张` : "图片"}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { padding: `0 ${theme.sp.md}px ${theme.sp.sm}px` },
  hero: {
    position: "relative",
    borderRadius: theme.r.md,
    overflow: "hidden",
    // P1-4: 用 16:9 比例 + maxHeight 上限,避免在大宽度下 Hero 过高导致与下方 1:1 网格视觉跳跃
    aspectRatio: "16 / 9",
    maxHeight: 180,
    boxShadow: theme.shadowCard,
    cursor: "pointer",
    // 渐变底:图片加载失败时作为占位,避免空白
    background: "linear-gradient(135deg, #2a2a2e 0%, #3a3a3e 50%, #2a2a2e 100%)",
  },
  img: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)",
  },
  actions: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    gap: 6,
    zIndex: 2,
  },
  actionBtn: {
    width: theme.btn.sm,
    height: theme.btn.sm,
    borderRadius: theme.r.pill,
    background: "rgba(0,0,0,0.45)",
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    border: "none",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: `background ${theme.durFast} ${theme.easeOut}`,
  },
  info: { position: "absolute", left: 14, right: 14, bottom: 12 },
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.4px",
    textTransform: "uppercase",
    color: "#fff",
    background: "rgba(255,255,255,0.2)",
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    padding: "2px 7px",
    borderRadius: theme.r.xs,
    marginBottom: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: theme.r.pill,
    background: theme.danger,
  },
  title: {
    fontSize: theme.fs.title,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    marginBottom: 2,
    textShadow: "0 2px 8px rgba(0,0,0,0.5)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    fontSize: theme.fs.caption,
    color: theme.textSecondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
}
