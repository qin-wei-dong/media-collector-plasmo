// popup.tsx — 素材采集助手弹窗(Apple Music 沉浸风)
import { useState, useEffect, useCallback, useMemo } from "react"
import type { MediaItem } from "./types"
import { theme, getTimeBucket, TIME_ORDER } from "./popup-theme"
import { Hero } from "./components/Hero"
import { AuthorCarousel } from "./components/AuthorCarousel"
import { FloatBar } from "./components/FloatBar"
import { EmptyState } from "./components/EmptyState"
import { MediaCard } from "./components/MediaCard"
import { PreviewModal } from "./components/PreviewModal"

// 注入全局样式:覆盖 Plasmo 默认 body 白底/margin,让 popup 整体深色透明
function injectPopupStyles() {
  const id = "__mc_popup_style"
  if (document.getElementById(id)) return
  const style = document.createElement("style")
  style.id = id
  style.textContent = `
    html, body { margin:0; padding:0; background:transparent; width:460px; height:100%; overflow:hidden; }
    #__plasmo { height:100%; overflow:hidden; background:transparent; border-radius:20px; }
    @keyframes mc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `
  document.head.appendChild(style)
}

function Popup() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [authorFilter, setAuthorFilter] = useState("")
  const [platformFilter, setPlatformFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")

  // 注入全局样式(覆盖 Plasmo 默认白底)
  useEffect(() => {
    injectPopupStyles()
  }, [])

  // 添加动画样式
  useEffect(() => {
    const styleId = "__mc_animations"
    if (document.getElementById(styleId)) return
    const style = document.createElement("style")
    style.id = styleId
    style.textContent = `
      @keyframes mc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes mc-progress { 
        0% { transform: translateX(-100%); } 
        50% { transform: translateX(100%); } 
        100% { transform: translateX(-100%); } 
      }
    `
    document.head.appendChild(style)
  }, [])



  const loadItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
      if (resp?.items) setItems(resp.items)
    })
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // ===== 数据聚合 =====

  // Hero 候选:取最新一条。优先有封面的,降序取最新。
  const heroItem = useMemo(() => {
    if (!items.length) return null
    const sorted = [...items].sort(
      (a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    )
    // 优先取有封面 URL 的(图集首图或视频 coverUrl)
    return sorted.find((i) => i.coverUrl) || sorted[0]
  }, [items])

  // Hero 关联的同 noteId 图片数(仅图集有意义)
  const heroImageCount = useMemo(() => {
    if (!heroItem?.noteId) return undefined
    return items.filter((i) => i.noteId === heroItem.noteId).length
  }, [items, heroItem])

  // 作者聚合
  const authors = useMemo(() => {
    const map = new Map<string, { count: number; firstItem: MediaItem; latest: number }>()
    const sorted = [...items].sort(
      (a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    )
    for (const it of sorted) {
      const key = it.author || ""
      const cur = map.get(key)
      if (cur) {
        cur.count++
      } else {
        map.set(key, { count: 1, firstItem: it, latest: new Date(it.collectedAt).getTime() })
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        if (a === "" && b !== "") return 1
        if (a !== "" && b === "") return -1
        return 0
      })
      .map(([name, v]) => ({ name, count: v.count, firstItem: v.firstItem }))
  }, [items])

  // 每个 noteId 的图片数(给 MediaCard 显示角标用)
  const noteImageCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      if (it.noteId) m.set(it.noteId, (m.get(it.noteId) || 0) + 1)
    }
    return m
  }, [items])

  // 搜索过滤:按标题/作者匹配 + 作者/平台/类型筛选
  const searchLower = searchQuery.trim().toLowerCase()
  const authorLower = authorFilter.trim().toLowerCase()
  const filteredItems = useMemo(() => {
    let result = items
    if (authorLower) {
      result = result.filter((i) => (i.author || "").toLowerCase() === authorLower)
    }
    if (platformFilter) {
      result = result.filter((i) => i.platform === platformFilter)
    }
    if (typeFilter) {
      result = result.filter((i) => i.type === typeFilter)
    }
    if (searchLower) {
      result = result.filter(
        (i) =>
          (i.title || "").toLowerCase().includes(searchLower) ||
          (i.author || "").toLowerCase().includes(searchLower)
      )
    }
    return result
  }, [items, searchLower, authorLower, platformFilter, typeFilter])

  // 按时间分桶(每桶内按时间倒序)——基于过滤后的数据
  const timeBuckets = useMemo(() => {
    const buckets = new Map<string, MediaItem[]>()
    const sorted = [...filteredItems].sort(
      (a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    )
    for (const it of sorted) {
      const b = getTimeBucket(it.collectedAt)
      const arr = buckets.get(b)
      if (arr) arr.push(it)
      else buckets.set(b, [it])
    }
    return buckets
  }, [filteredItems])

  // ===== 选择 =====
  const selectedSet = useMemo(
    () => new Set(items.filter((i) => i._selected).map((i) => i.id)),
    [items]
  )
  const selectedCount = selectedSet.size

  const toggleItem = (item: MediaItem) => {
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, _selected: !i._selected } : i))
    )
  }

  // 预览:打开时找到同 noteId 的兄弟图片(用于左右切换);无 noteId 则只显示自己
  const openPreview = (item: MediaItem) => {
    setPreviewItem(item)
  }
  const previewSiblings = useMemo(() => {
    if (!previewItem) return [previewItem!].filter(Boolean)
    if (!previewItem.noteId) return [previewItem]
    return items.filter((i) => i.noteId === previewItem.noteId)
  }, [previewItem, items])

  const clearSelection = () => {
    setItems((prev) => prev.map((i) => ({ ...i, _selected: false })))
  }

  // ===== 操作 =====
  const buildFilename = (item: MediaItem) => {
    const ext = item.type === "video" ? "mp4" : "jpg"
    const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
    return item.groupIndex !== undefined
      ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
      : `${baseName}.${ext}`
  }

  const [downloadError, setDownloadError] = useState("")

  const batchDownload = () => {
    const selected = items.filter((i) => i._selected)
    if (!selected.length) return
    setBatchDownloading(true)
    setDownloadError("")
    chrome.runtime.sendMessage(
      {
        type: "BATCH_DOWNLOAD",
        payload: selected.map((i) => ({
          url: i.url,
          filename: buildFilename(i),
          platform: i.platform,
        })),
      },
      (resp) => {
        setBatchDownloading(false)
        if (resp?.success) {
          clearSelection()
        } else {
          // 下载失败:显示具体错误(而非静默清选)
          setDownloadError(resp?.errors?.[0] || "下载失败,请确保打开了小红书/抖音页面")
        }
      }
    )
  }

  // 全选/取消全选当前筛选结果
  const toggleSelectAll = () => {
    const filteredIds = new Set(filteredItems.map((i) => i.id))
    const selectedFiltered = items.filter((i) => i._selected && filteredIds.has(i.id))
    const allSelected = selectedFiltered.length >= filteredItems.length
    setItems((prev) =>
      prev.map((i) => {
        if (!filteredIds.has(i.id)) return i
        return { ...i, _selected: !allSelected }
      })
    )
  }

  // 删除:逐条发送 REMOVE_ITEMS 到 background,走 enqueueWrite 原子删
  const removeSelected = () => {
    const ids = items.filter((i) => i._selected).map((i) => i.id)
    chrome.runtime.sendMessage({ type: "REMOVE_ITEMS", payload: ids }, () => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] 删除失败", chrome.runtime.lastError)
      }
      // 重新拉取最新数据并判断是否需要清除作者筛选
      chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
        if (resp?.items) {
          setItems(resp.items)
          // 当前筛选的作者已无素材则自动回到全部
          if (authorFilter) {
            const hasAuthor = (resp.items as MediaItem[]).some(
              (i: MediaItem) => (i.author || "") === authorFilter
            )
            if (!hasAuthor) setAuthorFilter("")
          }
        }
      })
    })
  }

  if (items.length === 0) {
    return (
      <div style={styles.root}>
        <div style={styles.ambient} />
        <div style={styles.content}>
          <div style={styles.navbar}>
            <span style={styles.largetitle}>素材</span>
          </div>
          <EmptyState />
        </div>
      </div>
    )
  }

  return (
    <div style={styles.root}>
      <div style={styles.ambient} />
      <div style={styles.content}>
        {/* 顶栏 */}
        <div style={styles.navbar}>
          <div>
            <span style={styles.largetitle}>素材</span>
            <span style={styles.countBadge}>{items.length}</span>
          </div>
          <div style={styles.tools}>
            <div
              style={{ ...styles.tool, ...(searchOpen ? styles.toolActive : {}) }}
              title="搜索"
              onClick={() => {
                setSearchOpen(!searchOpen)
                setSearchQuery("")
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        {searchOpen && (
          <div style={styles.searchWrap}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={styles.searchIcon}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              style={styles.searchInput}
              placeholder="搜索标题或作者"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <div style={styles.searchClear} onClick={() => setSearchQuery("")}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* 筛选标签:平台 + 类型 */}
        <div style={styles.filterRow}>
          {[
            { key: "", label: "全部" },
            { key: "xiaohongshu", label: "小红书" },
            { key: "douyin", label: "抖音" },
          ].map((f) => (
            <button
              key={f.key}
              style={{
                ...styles.filterBtn,
                ...(platformFilter === f.key ? styles.filterBtnActive : {}),
              }}
              onClick={() => setPlatformFilter(platformFilter === f.key ? "" : f.key)}
            >
              {f.label}
            </button>
          ))}
          <div style={styles.filterDivider} />
          {[
            { key: "", label: "全部" },
            { key: "image", label: "图片" },
            { key: "video", label: "视频" },
          ].map((f) => (
            <button
              key={f.key}
              style={{
                ...styles.filterBtn,
                ...(typeFilter === f.key ? styles.filterBtnActive : {}),
              }}
              onClick={() => setTypeFilter(typeFilter === f.key ? "" : f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* 作者筛选指示器 */}
        {authorFilter && (
          <div style={styles.filterChip}>
            <span style={styles.filterChipText}>作者: {authorFilter || "未分类"}</span>
            <div style={styles.filterChipClear} onClick={() => setAuthorFilter("")}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          </div>
        )}

        {/* Hero */}
        {heroItem && (
          <Hero item={heroItem} count={heroImageCount ?? 1} onClick={() => openPreview(heroItem!)} />
        )}

        {/* 滚动区 */}
        <div style={styles.scrollArea}>
          <AuthorCarousel authors={authors} selectedAuthor={authorFilter} onSelect={setAuthorFilter} />

          {TIME_ORDER.map((bucket) => {
            const bucketItems = timeBuckets.get(bucket)
            if (!bucketItems || !bucketItems.length) return null
            return (
              <div key={bucket} style={styles.gridSection}>
                <div style={styles.gridHead}>
                  <span style={styles.gridTitle}>{bucket}</span>
                  <span style={styles.gridCount}>{bucketItems.length} 张</span>
                </div>
                <div style={styles.gridWrap}>
                  {bucketItems.map((item) => (
                    <MediaCard
                      key={item.id}
                      item={item}
                      selected={selectedSet.has(item.id)}
                      imageCountInNote={item.noteId ? noteImageCounts.get(item.noteId) : undefined}
                      compact
                      onPreview={() => openPreview(item)}
                      onToggleSelect={() => toggleItem(item)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* 浮动操作栏 */}
        {filteredItems.length > 0 && (
          <FloatBar
            selectedCount={selectedCount}
            totalCount={filteredItems.length}
            downloading={batchDownloading}
            onDownload={batchDownload}
            onDelete={removeSelected}
            onToggleSelectAll={toggleSelectAll}
          />
        )}

        {/* 下载错误提示 */}
        {downloadError && (
          <div style={styles.errorToast} onClick={() => setDownloadError("")}>
            {downloadError}
          </div>
        )}

        {/* 大图预览 */}
        {previewItem && (
          <PreviewModal
            item={previewItem}
            siblings={previewSiblings}
            onClose={() => setPreviewItem(null)}
            onNavigate={setPreviewItem}
          />
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    width: 460,
    height: 660,
    background: theme.bg,
    color: theme.textPrimary,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif',
    position: "relative",
    overflow: "hidden",
    borderRadius: 20,
  },
  // 氛围色背景(从 Hero 封面色渗入)
  ambient: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    background:
      "radial-gradient(ellipse 70% 45% at 30% 0%, rgba(255,90,95,0.22), transparent 60%)," +
      "radial-gradient(ellipse 65% 55% at 85% 25%, rgba(120,80,255,0.18), transparent 55%)," +
      "linear-gradient(180deg, #0a0a0c 0%, #1c1c1e 100%)",
  },
  content: {
    position: "absolute",
    inset: 0,
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  navbar: {
    flexShrink: 0,
    padding: "14px 16px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  largetitle: {
    fontSize: 26,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  countBadge: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.textSecondary,
    background: theme.card,
    padding: "2px 8px",
    borderRadius: 8,
    marginLeft: 6,
    verticalAlign: "middle",
  },
  tools: { display: "flex", gap: 6 },
  tool: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: theme.textSecondary,
    background: theme.card,
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
  },
  gridSection: { padding: "0 16px 14px" },
  gridHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  gridTitle: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px", color: theme.textPrimary },
  gridCount: { fontSize: 12, color: theme.textTertiary, fontWeight: 500 },
  gridWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: 12,
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    paddingBottom: 76,
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.15) transparent",
  },
  toolActive: {
    background: theme.accent,
    color: "#000",
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "0 16px 10px",
    padding: "7px 12px",
    background: theme.card,
    borderRadius: 8,
  },
  searchIcon: {
    color: theme.textTertiary,
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    border: "none",
    background: "transparent",
    outline: "none",
    color: theme.textPrimary,
    fontSize: 15,
    fontFamily: "inherit",
  },
  searchClear: {
    cursor: "pointer",
    color: theme.textTertiary,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
    height: 20,
    flexShrink: 0,
  },
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: "0 16px 8px",
    flexWrap: "wrap",
  },
  filterBtn: {
    border: "1px solid transparent",
    background: theme.card,
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 12,
    cursor: "pointer",
    transition: `all ${theme.durFast} ${theme.easeOut}`,
    fontFamily: "inherit",
  },
  filterBtnActive: {
    background: "rgba(255,255,255,0.18)",
    color: "#fff",
    fontWeight: 600,
    borderColor: "rgba(255,255,255,0.35)",
    boxShadow: "0 0 12px rgba(255,255,255,0.08)",
    transform: "scale(1.02)",
  },
  filterDivider: {
    width: 1,
    height: 16,
    background: theme.hairline,
    margin: "0 2px",
  },
  filterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    margin: "0 20px 8px",
    padding: "6px 12px",
    background: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 500,
    color: theme.textSecondary,
    alignSelf: "flex-start",
  },
  filterChipText: {
    color: theme.textSecondary,
  },
  filterChipClear: {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.textTertiary,
    width: 16,
    height: 16,
  },
  errorToast: {
    position: "absolute",
    bottom: 72,
    left: 14,
    right: 14,
    background: "rgba(255,69,58,0.9)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#fff",
    fontSize: 13,
    padding: "10px 14px",
    borderRadius: 12,
    zIndex: 11,
    cursor: "pointer",
    textAlign: "center",
  },
}

export default Popup
