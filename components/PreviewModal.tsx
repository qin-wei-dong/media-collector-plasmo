// components/PreviewModal.tsx — 全屏大图预览(支持左右切换)
import { useState, useEffect, useCallback } from "react"
import type { MediaItem } from "../types"
import { theme } from "../popup-theme"

interface PreviewModalProps {
  item: MediaItem
  siblings: MediaItem[] // 同笔记的图片列表(用于左右切换)
  onClose: () => void
  onNavigate: (item: MediaItem) => void
}

export function PreviewModal({ item, siblings, onClose, onNavigate }: PreviewModalProps) {
  const [imgLoading, setImgLoading] = useState(true)
  const [imgError, setImgError] = useState(false)
  const currentIndex = siblings.findIndex((i) => i.id === item.id)

  const goPrev = useCallback(() => {
    if (currentIndex > 0) onNavigate(siblings[currentIndex - 1])
  }, [currentIndex, siblings, onNavigate])

  const goNext = useCallback(() => {
    if (currentIndex < siblings.length - 1) onNavigate(siblings[currentIndex + 1])
  }, [currentIndex, siblings, onNavigate])

  // 切换图片时重置加载状态
  useEffect(() => {
    setImgLoading(true)
    setImgError(false)
  }, [item.id])

  // 键盘左右切换
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") goPrev()
      else if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goPrev, goNext, onClose])

  const isVideo = item.type === "video"
  const src = item.url

  return (
    <div style={styles.overlay} onClick={onClose}>
      {/* 顶栏 */}
      <div style={styles.topbar} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeBtn} onClick={onClose}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div style={styles.topInfo}>
          <div style={styles.topTitle}>{item.title || "未命名素材"}</div>
          {siblings.length > 1 && (
            <div style={styles.topCounter}>{currentIndex + 1} / {siblings.length}</div>
          )}
        </div>
        <div style={styles.spacer} />
      </div>

      {/* 内容 */}
      <div style={styles.content} onClick={(e) => e.stopPropagation()}>
        {/* 左箭头 */}
        {currentIndex > 0 && (
          <button style={{ ...styles.navBtn, ...styles.navLeft }} onClick={goPrev}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* 媒体 */}
        {isVideo ? (
          <video
            src={src}
            style={styles.video}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div style={styles.imgContainer}>
            {imgLoading && !imgError && (
              <div style={styles.loadingSpinner}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: "mc-spin 0.8s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
            )}
            {imgError ? (
              <div style={styles.errorState}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>图片加载失败</span>
              </div>
            ) : (
              <img 
                src={src} 
                style={{ ...styles.img, opacity: imgLoading ? 0 : 1 }} 
                onClick={(e) => e.stopPropagation()}
                onLoad={() => setImgLoading(false)}
                onError={() => { setImgLoading(false); setImgError(true) }}
              />
            )}
          </div>
        )}

        {/* 右箭头 */}
        {currentIndex < siblings.length - 1 && (
          <button style={{ ...styles.navBtn, ...styles.navRight }} onClick={goNext}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* 底部信息 */}
      <div style={styles.footer} onClick={(e) => e.stopPropagation()}>
        <div style={styles.footerLeft}>
          {item.author && <span style={styles.author}>{item.author}</span>}
          <span style={styles.meta}>
            {isVideo ? "视频" : "图片"}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
          </span>
        </div>
        <div style={styles.footerRight}>
          {siblings.length > 1 && (
            <span style={styles.keyboardHint}>
              <kbd style={styles.kbd}>←</kbd> <kbd style={styles.kbd}>→</kbd> 切换
            </span>
          )}
          {item.sourceUrl && (
            <button
              style={styles.sourceBtn}
              onClick={() => {
                try {
                  chrome.tabs.create({ url: item.sourceUrl, active: false })
                } catch {}
              }}
              title="打开原笔记"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              原笔记
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "absolute",
    inset: 0,
    zIndex: 100,
    background: "rgba(0,0,0,0.92)",
    backdropFilter: theme.glassBlurStrong,
    WebkitBackdropFilter: theme.glassBlurStrong,
    display: "flex",
    flexDirection: "column",
    borderRadius: 16,
  },
  topbar: {
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    flexShrink: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    background: theme.cardHover,
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  topInfo: { flex: 1, marginLeft: 12, minWidth: 0 },
  topTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#fff",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  topCounter: { fontSize: 12, color: theme.textTertiary, marginTop: 2 },
  spacer: { width: 32 },
  content: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 8px",
    position: "relative",
    minHeight: 0,
  },
  imgContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    position: "relative",
  },
  img: {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    borderRadius: 8,
    transition: "opacity 0.2s ease",
  },
  video: {
    maxWidth: "100%",
    maxHeight: "100%",
    borderRadius: 8,
  },
  loadingSpinner: {
    position: "absolute",
    color: "rgba(255,255,255,0.5)",
  },
  errorState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
  },
  navBtn: {
    position: "absolute",
    top: "50%",
    transform: "translateY(-50%)",
    width: 40,
    height: 40,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.12)",
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    transition: `all ${theme.durFast} ${theme.easeOut}`,
  },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  footer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 16px",
    flexShrink: 0,
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  footerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  author: { fontSize: 13, color: theme.textSecondary, fontWeight: 500 },
  meta: { fontSize: 13, color: theme.textTertiary },
  keyboardHint: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    color: "rgba(255,255,255,0.4)",
  },
  kbd: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 20,
    height: 20,
    padding: "0 4px",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "inherit",
  },
  sourceBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontSize: 12,
    fontWeight: 500,
    padding: "5px 12px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: `all ${theme.durFast} ${theme.easeOut}`,
  },
}
