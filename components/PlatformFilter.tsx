// components/PlatformFilter.tsx — 平台筛选组件
import React from "react"
import { PLATFORM_LABELS } from "../types"

interface PlatformFilterProps {
  activePlatform: string | null
  platformCounts: Record<string, number>
  onChange: (platform: string | null) => void
}

export function PlatformFilter({ activePlatform, platformCounts, onChange }: PlatformFilterProps) {
  const allCount = Object.values(platformCounts).reduce((a, b) => a + b, 0)

  return (
    <div style={styles.filterRow}>
      <button
        onClick={() => onChange(null)}
        style={{
          ...styles.filterBtn,
          background: activePlatform === null ? "#ff2d55" : "#f0f0f0",
          color: activePlatform === null ? "#fff" : "#666",
          fontWeight: activePlatform === null ? 600 : 400,
        }}>
        全部 ({allCount})
      </button>
      {Object.entries(platformCounts).map(([platform, count]) => (
        <button
          key={platform}
          onClick={() => onChange(platform)}
          style={{
            ...styles.filterBtn,
            background: activePlatform === platform ? "#ff2d55" : "#f0f0f0",
            color: activePlatform === platform ? "#fff" : "#666",
            fontWeight: activePlatform === platform ? 600 : 400,
          }}>
          {PLATFORM_LABELS[platform] || platform} ({count})
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  filterRow: {
    display: "flex",
    gap: 6,
    padding: "6px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
    overflowX: "auto",
  },
  filterBtn: {
    border: "none",
    borderRadius: 12,
    padding: "4px 12px",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
}
