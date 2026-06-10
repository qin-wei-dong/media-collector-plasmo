// popup.tsx — 素材采集助手弹窗主组件
import { useState, useEffect, useCallback, useMemo } from "react"
import type { MediaItem } from "./types"
import { BatchBar } from "./components/BatchBar"
import { PlatformFilter } from "./components/PlatformFilter"
import { MediaCard } from "./components/MediaCard"
import { NoteGroup } from "./components/NoteGroup"

function Popup() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [activePlatform, setActivePlatform] = useState<string | null>(null)

  const loadItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
      if (resp?.items) setItems(resp.items)
    })
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // 平台筛选
  const filteredItems = useMemo(() => {
    if (!activePlatform) return items
    return items.filter((i) => i.platform === activePlatform)
  }, [items, activePlatform])

  // 平台计数
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((i) => {
      counts[i.platform] = (counts[i.platform] || 0) + 1
    })
    return counts
  }, [items])

  // 笔记分组
  const { groupedItems, ungroupedItems } = useMemo(() => {
    const groups = new Map<string, MediaItem[]>()
    const ungrouped: MediaItem[] = []

    filteredItems.forEach((item) => {
      if (item.noteId) {
        const existing = groups.get(item.noteId)
        if (existing) {
          existing.push(item)
        } else {
          groups.set(item.noteId, [item])
        }
      } else {
        ungrouped.push(item)
      }
    })

    return { groupedItems: groups, ungroupedItems: ungrouped }
  }, [filteredItems])

  const selectedSet = useMemo(() => {
    return new Set(filteredItems.filter((i) => i._selected).map((i) => i.id))
  }, [filteredItems])

  const selectedCount = selectedSet.size

  const toggleItem = (globalIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === globalIndex ? { ...item, _selected: !item._selected } : item))
    )
  }

  const toggleAll = () => {
    const newVal = !selectAll
    setSelectAll(newVal)
    setItems((prev) =>
      prev.map((item) => {
        if (!activePlatform || item.platform === activePlatform) {
          return { ...item, _selected: newVal }
        }
        return item
      })
    )
  }

  const downloadSingle = (item: MediaItem) => {
    const ext = item.type === "video" ? "mp4" : "jpg"
    const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
    const filename =
      item.groupIndex !== undefined
        ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
        : `${baseName}.${ext}`
    chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", payload: { url: item.url, filename } })
  }

  const batchDownload = () => {
    const selected = filteredItems.filter((i) => i._selected)
    if (selected.length === 0) return
    setBatchDownloading(true)
    chrome.runtime.sendMessage(
      {
        type: "BATCH_DOWNLOAD",
        payload: selected.map((item) => {
          const ext = item.type === "video" ? "mp4" : "jpg"
          const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
          return {
            url: item.url,
            filename:
              item.groupIndex !== undefined
                ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
                : `${baseName}.${ext}`,
          }
        }),
      },
      () => {
        setBatchDownloading(false)
        setItems((prev) => prev.map((i) => ({ ...i, _selected: false })))
        setSelectAll(false)
      }
    )
  }

  const removeItem = (id: string) => {
    const filtered = items.filter((i) => i.id !== id)
    chrome.storage.local.set({ collected_media: filtered }, () => setItems(filtered))
  }

  const clearAll = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_ITEMS" }, () => setItems([]))
  }

  // 获取 item 在原始 items 数组中的索引
  const getGlobalIndex = useCallback(
    (item: MediaItem) => items.findIndex((i) => i.id === item.id),
    [items]
  )

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <p style={{ color: "#999" }}>还没有采集素材</p>
        <p style={{ fontSize: 13, color: "#bbb", marginTop: 8, lineHeight: 1.6 }}>
          打开 <b>小红书</b> 或 <b>抖音</b>，
          <br />
          鼠标悬停图片，点击采集按钮
        </p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>🎬 素材采集助手</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={styles.badge}>{items.length}</span>
          <button onClick={clearAll} style={styles.iconBtn} title="清空">
            🗑️
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <PlatformFilter
        activePlatform={activePlatform}
        platformCounts={platformCounts}
        onChange={setActivePlatform}
      />

      {/* Batch Bar */}
      <BatchBar
        selectAll={selectAll}
        selectedCount={selectedCount}
        totalCount={filteredItems.length}
        batchDownloading={batchDownloading}
        onToggleAll={toggleAll}
        onBatchDownload={batchDownload}
      />

      {/* List with Note Groups */}
      <ul style={styles.list}>
        {/* 笔记分组 */}
        {Array.from(groupedItems.entries()).map(([noteId, noteItems]) => (
          <NoteGroup
            key={noteId}
            noteId={noteId}
            title={noteItems[0]?.title || "未命名笔记"}
            items={noteItems}
            onToggleItem={toggleItem}
            onDownloadItem={downloadSingle}
            onRemoveItem={removeItem}
            selectedSet={selectedSet}
            getGlobalIndex={getGlobalIndex}
          />
        ))}

        {/* 未分组 */}
        {ungroupedItems.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selectedSet.has(item.id)}
            onToggle={() => toggleItem(getGlobalIndex(item))}
            onDownload={() => downloadSingle(item)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </ul>

      <div style={styles.footer}>
        <small style={{ color: "#bbb", fontSize: 11 }}>支持平台：小红书 · 抖音</small>
      </div>
    </div>
  )
}

// ====== inline styles ======
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 380,
    minHeight: 420,
    maxHeight: 600,
    display: "flex",
    flexDirection: "column",
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    background: "#fafafa",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    background: "linear-gradient(135deg, #ff2d55, #ff6b81)",
    color: "#fff",
    flexShrink: 0,
  },
  badge: {
    background: "rgba(255,255,255,0.3)",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
    borderRadius: 4,
  },
  list: {
    flex: 1,
    listStyle: "none",
    overflowY: "auto",
    padding: 8,
    margin: 0,
  },
  empty: {
    width: 380,
    height: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  },
  footer: {
    textAlign: "center",
    padding: 8,
    borderTop: "1px solid #eee",
    background: "#fff",
    flexShrink: 0,
  },
}

export default Popup
