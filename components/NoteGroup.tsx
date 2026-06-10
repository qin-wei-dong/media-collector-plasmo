// components/NoteGroup.tsx — 笔记分组折叠组件
import React, { useState } from "react"
import type { MediaItem } from "../types"
import { MediaCard } from "./MediaCard"

interface NoteGroupProps {
  noteId: string
  title: string
  items: MediaItem[]
  onToggleItem: (index: number, globalIndex: number) => void
  onDownloadItem: (item: MediaItem) => void
  onRemoveItem: (id: string) => void
  selectedSet: Set<string>
  getGlobalIndex: (item: MediaItem) => number
}

export function NoteGroup({
  noteId,
  title,
  items,
  onToggleItem,
  onDownloadItem,
  onRemoveItem,
  selectedSet,
  getGlobalIndex,
}: NoteGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={styles.group}>
      <div style={styles.groupHeader} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 18, transition: "transform 0.2s", transform: collapsed ? "rotate(-90deg)" : "none" }}>
          ▾
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333", flex: 1 }}>
          📝 {title || "未命名笔记"}
        </span>
        <span style={styles.groupBadge}>{items.length} 张</span>
      </div>
      {!collapsed && (
        <div style={styles.groupBody}>
          {items
            .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
            .map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={selectedSet.has(item.id)}
                onToggle={() => onToggleItem(items.indexOf(item), getGlobalIndex(item))}
                onDownload={() => onDownloadItem(item)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    marginBottom: 8,
    borderRadius: 10,
    border: "1px solid #eee",
    overflow: "hidden",
    background: "#fff",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    cursor: "pointer",
    userSelect: "none",
    background: "#fafafa",
  },
  groupBadge: {
    fontSize: 11,
    color: "#999",
    background: "#f0f0f0",
    padding: "1px 8px",
    borderRadius: 8,
  },
  groupBody: {
    padding: "4px 8px",
  },
}
