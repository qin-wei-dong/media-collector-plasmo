// components/BatchBar.tsx — 批量操作栏
import React from "react"

interface BatchBarProps {
  selectAll: boolean
  selectedCount: number
  totalCount: number
  batchDownloading: boolean
  onToggleAll: () => void
  onBatchDownload: () => void
}

export function BatchBar({
  selectAll,
  selectedCount,
  totalCount,
  batchDownloading,
  onToggleAll,
  onBatchDownload,
}: BatchBarProps) {
  return (
    <div style={styles.batchBar}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          cursor: "pointer",
        }}>
        <input
          type="checkbox"
          checked={selectAll && totalCount > 0}
          onChange={onToggleAll}
          style={{ accentColor: "#ff2d55" }}
        />
        全选
      </label>
      <span style={{ fontSize: 12, color: "#999", flex: 1 }}>
        已选 {selectedCount} / {totalCount}
      </span>
      <button
        onClick={onBatchDownload}
        disabled={selectedCount === 0 || batchDownloading}
        style={{
          ...styles.batchBtn,
          opacity: selectedCount === 0 ? 0.4 : 1,
        }}>
        {batchDownloading ? "下载中..." : "⬇️ 批量下载"}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  batchBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
  },
  batchBtn: {
    background: "linear-gradient(135deg, #ff2d55, #ff6b81)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
}
