// components/MediaCard.tsx — 素材卡片组件
import React from "react"
import type { MediaItem } from "../types"
import { PLATFORM_LABELS } from "../types"

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onDownload: () => void
  onRemove: () => void
}

export function MediaCard({ item, selected, onToggle, onDownload, onRemove }: MediaCardProps) {
  const platformLabel = PLATFORM_LABELS[item.platform] || item.platform

  return (
    <li
      style={{
        ...styles.card,
        borderColor: selected ? "#ff2d55" : "#eee",
        background: selected ? "#fff5f7" : "#fff",
      }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        style={{ accentColor: "#ff2d55", flexShrink: 0, width: 18, height: 18, cursor: "pointer" }}
      />
      <img
        src={item.url}
        style={{
          ...styles.thumb,
          objectFit: item.type === "video" ? "contain" : "cover",
          background: item.type === "video" ? "#000" : "#f0f0f0",
        }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).src =
            "data:image/svg+xml," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="#ddd"><rect width="56" height="56"/><text x="50%" y="55%" text-anchor="middle" font-size="22">${
                item.type === "video" ? "🎬" : "🖼️"
              }</text></svg>`
            )
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.title}>
          {item.title || item.url.split("/").pop() || "未命名素材"}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              background: item.platform === "xiaohongshu" ? "#ff2442" : "#000",
              color: "#fff",
            }}>
            {platformLabel}
          </span>
          <span style={{ fontSize: 11, color: "#666" }}>
            {item.type === "video" ? "🎬 视频" : "🖼️ 图片"}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <button onClick={onDownload} style={styles.dlBtn}>
          下载
        </button>
        <button onClick={onRemove} style={styles.rmBtn} title="移除">
          ×
        </button>
      </div>
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "flex",
    gap: 10,
    padding: 10,
    marginBottom: 6,
    borderRadius: 8,
    border: "1px solid #eee",
    alignItems: "center",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    flexShrink: 0,
  },
  title: {
    fontSize: 12,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-all",
  },
  dlBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  rmBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
}
