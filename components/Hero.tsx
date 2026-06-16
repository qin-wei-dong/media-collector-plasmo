// components/Hero.tsx — Hero 精选大卡(最新采集的笔记)
import { useState } from "react"
import type { MediaItem } from "../types"
import { theme } from "../popup-theme"

interface HeroProps {
  item: MediaItem
  count: number
  onClick?: () => void
}

export function Hero({ item, count, onClick }: HeroProps) {
  const cover = item.coverUrl || item.url
  const isVideo = item.type === "video"
  const [imgError, setImgError] = useState(false)

  return (
    <div style={styles.wrap}>
      <div onClick={onClick} style={styles.hero}>
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
  wrap: { padding: "0 16px 12px" },
  hero: {
    position: "relative",
    borderRadius: theme.r.md,
    overflow: "hidden",
    aspectRatio: "16 / 9",
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
    top: 14,
    right: 14,
    display: "flex",
    gap: 6,
  },
  btn: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.4)",
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    border: "none",
    color: "#fff",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
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
    borderRadius: 5,
    marginBottom: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: "50%",
    background: "#FF453A",
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    marginBottom: 2,
    textShadow: "0 2px 8px rgba(0,0,0,0.5)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    fontSize: 12,
    color: theme.textSecondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
}
