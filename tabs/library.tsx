import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, MediaItem, MediaType, Platform } from "../types"
import { PLATFORM_LABELS } from "../types"
import { getTimeBucket, TIME_ORDER, type ThemeTokens } from "../lib/design-tokens"
import { ThemeProvider, useTheme } from "../lib/use-theme"
import { PreviewModal } from "../components/PreviewModal"

type Scope = "all" | "recent" | "uncategorized"
type ViewMode = "grid" | "list"
type DialogState =
  | { type: "create" }
  | { type: "assign" }
  | { type: "rename"; collection: Collection }
  | { type: "delete"; collection: Collection }
  | null
type IconName =
  | "box"
  | "bookmark"
  | "check"
  | "clock"
  | "download"
  | "external"
  | "filter"
  | "grid"
  | "image"
  | "list"
  | "plus"
  | "play"
  | "search"
  | "trash"
  | "user"
  | "view"

interface Notice {
  message: string
  actionLabel?: string
  onAction?: () => void
  kind?: "success" | "error" | "info"
}

function injectLibraryStyles(theme: ThemeTokens) {
  const id = "__mc_library_style"
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = id
    document.head.appendChild(el)
  }

  el.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${theme.bg};
      color: ${theme.textPrimary};
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
    }
    #__plasmo { height: 100%; }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    button { -webkit-tap-highlight-color: transparent; }
    :focus { outline: none; }
    :focus-visible {
      outline: 2px solid ${theme.accent};
      outline-offset: 2px;
      border-radius: ${theme.r.sm}px;
    }
    .mc-library-scroll::-webkit-scrollbar { width: 8px; }
    .mc-library-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.10);
      border-radius: ${theme.r.xs}px;
    }
    .mc-library-cell:hover {
      transform: translateY(-3px);
      box-shadow: 0 14px 30px rgba(0,0,0,0.5);
    }
    .mc-library-cell:hover .mc-library-check { opacity: 1; }
    .mc-library-cell:hover .mc-library-info { opacity: 1; }
    .mc-library-button:active,
    .mc-library-cell:active {
      transform: scale(0.95);
    }
  `
}

// ===== M4 导出路径解析 =====

/** 清洗路径段:去掉非法字符,折叠空白,限制长度;空或 `.` / `..` 回退。 */
function sanitizePathSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
  if (cleaned === "." || cleaned === "..") return fallback
  return cleaned || fallback
}

interface ExportContext {
  collectionFilter: string
  collections: Collection[]
}

/**
 * 解析素材导出目录(M4 plan 4.1 优先级):
 * 1. 当前正在查看收藏夹 → 该收藏夹名
 * 2. 素材已归属收藏夹 → 按 collections 顺序第一个匹配,否则 collectionIds[0] 对应名
 * 3. 作者
 * 4. “未分类”
 */
function resolveExportFolder(item: MediaItem, ctx: ExportContext): string {
  const nameById = (id: string) => ctx.collections.find((c) => c.id === id)?.name

  if (ctx.collectionFilter) {
    const name = nameById(ctx.collectionFilter)
    if (name) return sanitizePathSegment(name, "未分类")
  }

  const ids = item.collectionIds || []
  if (ids.length) {
    for (const c of ctx.collections) {
      if (ids.includes(c.id)) return sanitizePathSegment(c.name, "未分类")
    }
    const firstName = nameById(ids[0])
    if (firstName) return sanitizePathSegment(firstName, "未分类")
  }

  if (item.author) return sanitizePathSegment(item.author, "未分类")

  return "未分类"
}

/** 生成文件名(不含目录)。 */
function buildExportFilename(item: MediaItem): string {
  const ext = item.type === "video" ? "mp4" : "jpg"
  const baseName = sanitizePathSegment(item.title, "素材")
  return item.groupIndex !== undefined
    ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
    : `${baseName}.${ext}`
}

/** 完整相对路径:`<folder>/<filename>`。 */
function buildExportPath(item: MediaItem, ctx: ExportContext): string {
  return `${resolveExportFolder(item, ctx)}/${buildExportFilename(item)}`
}

/** 汇总目录用于 Toast:无目录返回空串,单个返回其名,多个返回“多个文件夹”。 */
function summarizeExportFolders(folders: string[]): string {
  const real = folders.filter(Boolean)
  if (real.length === 0) return ""
  if (real.length === 1) return real[0]
  return "多个文件夹"
}

function LibraryPage() {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const searchRef = useRef<HTMLInputElement | null>(null)

  const [items, setItems] = useState<MediaItem[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [collectionFilter, setCollectionFilter] = useState("")
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("")
  const [typeFilter, setTypeFilter] = useState<MediaType | "">("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortDesc, setSortDesc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [batchDownloading, setBatchDownloading] = useState(false)

  useEffect(() => {
    injectLibraryStyles(theme)
  }, [theme])

  const loadItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
      const err = chrome.runtime.lastError
      if (err || !resp) {
        console.warn("[Library] GET_ITEMS 失败,重试:", err?.message)
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (r2) => {
            if (r2?.items) setItems(r2.items)
          })
        }, 300)
        return
      }
      if (resp.items) setItems(resp.items)
    })
  }, [])

  const loadCollections = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_COLLECTIONS" }, (resp) => {
      const err = chrome.runtime.lastError
      if (err || !resp) {
        console.warn("[Library] GET_COLLECTIONS 失败,重试:", err?.message)
        setTimeout(() => {
          chrome.runtime.sendMessage({ type: "GET_COLLECTIONS" }, (r2) => {
            if (r2?.collections) setCollections(r2.collections)
          })
        }, 300)
        return
      }
      if (resp.collections) setCollections(resp.collections)
    })
  }, [])

  useEffect(() => {
    loadItems()
    loadCollections()
  }, [loadCollections, loadItems])

  // M5 Task 4:库页快捷键补齐 — Cmd/Ctrl+K 聚焦搜索,Esc 优先级 对话框 > 预览 > 搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (e.key === "Escape") {
        // 对话框优先:模态未关闭前,Esc 关闭模态而非预览/搜索
        if (dialog) {
          e.preventDefault()
          setDialog(null)
          return
        }
        if (previewItem) {
          e.preventDefault()
          setPreviewItem(null)
          return
        }
        if (document.activeElement === searchRef.current) {
          e.preventDefault()
          setSearch("")
          searchRef.current?.blur()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dialog, previewItem])

  // 切换任何筛选(范围/平台/收藏夹/类型/搜索)时清空选中:
  // selectedItems 基于全量 items,不清空则被隐藏的素材仍会随导出带出、"已选 N 项"也会失真。
  // 已空时返回同引用,React bail out,避免 search 每次击键触发 re-render。
  useEffect(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [scope, platformFilter, collectionFilter, typeFilter, search])

  // items 变化后清理 selectedIds 中的 stale id(其他 tab 删除 / loadItems 重拉 / 收藏夹级联清理时触发):
  // 不清会导致 selectedCount 失真,且不会影响批量操作(selectedItems 已过滤),
  // 但留着无意义且会干扰未来加 visibleSelectedItems 之类的严格防线。
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const validIds = new Set(items.map((item) => item.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  const authors = useMemo(() => {
    const map = new Map<string, { name: string; count: number; first: MediaItem }>()
    const sorted = [...items].sort((a, b) => +new Date(b.collectedAt) - +new Date(a.collectedAt))
    for (const item of sorted) {
      const key = item.author || ""
      const current = map.get(key)
      if (current) current.count += 1
      else map.set(key, { name: key, count: 1, first: item })
    }
    return [...map.values()].sort((a, b) => (a.name === "" ? 1 : b.name === "" ? -1 : b.count - a.count))
  }, [items])

  const stats = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const yesterdayStart = todayStart - 86400000
    const weekStart = todayStart - 7 * 86400000
    let today = 0
    let yesterday = 0
    let images = 0
    let videos = 0
    let exportedThisWeek = 0

    for (const item of items) {
      const collectedAt = +new Date(item.collectedAt)
      if (collectedAt >= todayStart) today += 1
      else if (collectedAt >= yesterdayStart) yesterday += 1
      if (item.type === "video") videos += 1
      else images += 1

      const exportedAt = (item as MediaItem & { exportedAt?: string }).exportedAt
      if (exportedAt && +new Date(exportedAt) >= weekStart) exportedThisWeek += 1
    }

    const trend = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : today > 0 ? 100 : 0
    return {
      today,
      trend,
      total: items.length,
      images,
      videos,
      authorCount: authors.filter((author) => author.name).length,
      topAuthor: authors.find((author) => author.name),
      exportedThisWeek,
    }
  }, [items, authors])

  const sidebarCounts = useMemo(() => {
    return {
      recent: items.filter((item) => getTimeBucket(item.collectedAt) === "今天").length,
      uncategorized: items.filter((item) => !item.collectionIds?.length).length,
      xhs: items.filter((item) => item.platform === "xiaohongshu").length,
      douyin: items.filter((item) => item.platform === "douyin").length,
    }
  }, [items])

  const collectionCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      for (const collectionId of item.collectionIds || []) {
        map.set(collectionId, (map.get(collectionId) || 0) + 1)
      }
    }
    return map
  }, [items])

  const noteImageCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of items) {
      if (item.noteId) map.set(item.noteId, (map.get(item.noteId) || 0) + 1)
    }
    return map
  }, [items])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (scope === "recent" && getTimeBucket(item.collectedAt) !== "今天") return false
      if (scope === "uncategorized" && item.collectionIds?.length) return false
      if (collectionFilter && !item.collectionIds?.includes(collectionFilter)) return false
      if (platformFilter && item.platform !== platformFilter) return false
      if (typeFilter && item.type !== typeFilter) return false
      if (q) {
        const haystack = `${item.title || ""} ${item.author || ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [collectionFilter, items, platformFilter, scope, search, typeFilter])

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const diff = +new Date(b.collectedAt) - +new Date(a.collectedAt)
      return sortDesc ? diff : -diff
    })
  }, [filteredItems, sortDesc])

  const buckets = useMemo(() => {
    const map = new Map<string, MediaItem[]>()
    for (const item of sortedItems) {
      const bucket = getTimeBucket(item.collectedAt)
      const arr = map.get(bucket)
      if (arr) arr.push(item)
      else map.set(bucket, [item])
    }
    return map
  }, [sortedItems])

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds])
  // selectedCount 取 selectedItems.length 而非 selectedIds.size,避免 items 变化时短暂失真
  // (selectedIds 已被 useEffect 清理过,但语义上"已选 N 项"必须等于"实际能批量操作的数量")
  const selectedCount = selectedItems.length
  const allCurrentSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.has(item.id))

  const pageTitle = useMemo(() => {
    if (collectionFilter) return collections.find((collection) => collection.id === collectionFilter)?.name || "收藏夹"
    if (platformFilter) return PLATFORM_LABELS[platformFilter]
    if (scope === "recent") return "最近采集"
    if (scope === "uncategorized") return "未分类"
    return "全部素材"
  }, [collectionFilter, collections, platformFilter, scope])

  const previewSiblings = useMemo(() => {
    if (!previewItem) return []
    if (!previewItem.noteId) return [previewItem]
    return items.filter((item) => item.noteId === previewItem.noteId)
  }, [items, previewItem])

  const selectScope = (next: Scope) => {
    setScope(next)
    setCollectionFilter("")
    if (next !== "all") setPlatformFilter("")
  }

  const selectPlatform = (next: Platform) => {
    setScope("all")
    setCollectionFilter("")
    setPlatformFilter((current) => (current === next ? "" : next))
  }

  const selectCollection = (collectionId: string) => {
    setScope("all")
    setPlatformFilter("")
    setCollectionFilter((current) => (current === collectionId ? "" : collectionId))
  }

  // M5 Task 3:一键清空所有筛选(供无结果空状态使用)
  const clearFilters = () => {
    setSearch("")
    setScope("all")
    setCollectionFilter("")
    setPlatformFilter("")
    setTypeFilter("")
  }

  // M5 Task 3:无结果空状态文案根据当前筛选动态生成
  const noMatchDesc = useMemo(() => {
    const parts: string[] = []
    if (search) parts.push(`关键词"${search}"`)
    if (scope === "recent") parts.push("最近采集")
    else if (scope === "uncategorized") parts.push("未分类")
    if (collectionFilter) {
      const name = collections.find((c) => c.id === collectionFilter)?.name
      if (name) parts.push(`收藏夹「${name}」`)
    }
    if (platformFilter) parts.push(PLATFORM_LABELS[platformFilter])
    if (typeFilter) parts.push(typeFilter === "image" ? "图片" : "视频")
    if (!parts.length) return ""
    return `当前筛选：${parts.join(" · ")}`
  }, [search, scope, collectionFilter, platformFilter, typeFilter, collections])

  const toggleItem = (item: MediaItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const ids = sortedItems.map((item) => item.id)
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const downloadItems = (targets: MediaItem[]) => {
    if (!targets.length) return
    setBatchDownloading(true)
    const ctx: ExportContext = { collectionFilter, collections }
    chrome.runtime.sendMessage(
      {
        type: "BATCH_DOWNLOAD",
        payload: targets.map((item) => ({
          id: item.id,
          url: item.url,
          filename: buildExportPath(item, ctx),
          platform: item.platform,
        })),
      },
      (resp) => {
        setBatchDownloading(false)
        if (resp?.success) {
          const folders = summarizeExportFolders(resp.folders || [])
          const folderText = folders ? `素材库/${folders}/` : "素材库/"
          const failed = resp.errors?.length ?? 0
          const okCount = resp.count ?? targets.length
          const partial = failed > 0
          setNotice({
            kind: partial ? "info" : "success",
            message: partial
              ? `已导出 ${okCount} / ${targets.length} 项到 ${folderText},${failed} 项失败`
              : `已导出 ${okCount} 项到 ${folderText}`,
            actionLabel: "打开下载目录",
            onAction: () => {
              chrome.runtime.sendMessage({ type: "SHOW_DOWNLOADS_FOLDER" })
            },
          })
          clearSelection()
          loadItems()
        } else {
          setNotice({
            kind: "error",
            message: resp?.errors?.[0] || "导出失败，请确保小红书或抖音页面可访问",
          })
        }
      }
    )
  }

  const removeSelected = () => {
    const backup = selectedItems.map(({ _selected, ...item }) => item)
    if (!backup.length) return
    const ids = backup.map((item) => item.id)

    chrome.runtime.sendMessage({ type: "REMOVE_ITEMS", payload: ids }, (resp) => {
      if (resp?.success) {
        setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
        clearSelection()
        setNotice({
          kind: "info",
          message: `已删除 ${ids.length} 项`,
          actionLabel: "撤销",
          onAction: () => {
            chrome.runtime.sendMessage({ type: "RESTORE_ITEMS", payload: backup }, () => {
              loadItems()
            })
          },
        })
      } else {
        setNotice({ kind: "error", message: resp?.error || "删除失败" })
      }
    })
  }

  const openSource = (item: MediaItem) => {
    if (!item.sourceUrl) return
    chrome.tabs.create({ url: item.sourceUrl, active: false })
  }

  const createCollection = (name: string, color: string) => {
    chrome.runtime.sendMessage({ type: "CREATE_COLLECTION", payload: { name, color } }, (resp) => {
      if (resp?.success) {
        setNotice({ kind: "success", message: `已创建收藏夹「${resp.collection?.name || name}」` })
        setDialog(null)
        loadCollections()
      } else {
        setNotice({ kind: "error", message: resp?.error || "创建收藏夹失败" })
      }
    })
  }

  const renameCollection = (collection: Collection, name: string) => {
    chrome.runtime.sendMessage({ type: "RENAME_COLLECTION", payload: { id: collection.id, name } }, (resp) => {
      if (resp?.success) {
        setNotice({ kind: "success", message: "已重命名收藏夹" })
        setDialog(null)
        loadCollections()
      } else {
        setNotice({ kind: "error", message: resp?.error || "重命名失败" })
      }
    })
  }

  const deleteCollection = (collection: Collection) => {
    chrome.runtime.sendMessage({ type: "DELETE_COLLECTION", payload: { id: collection.id } }, (resp) => {
      if (resp?.success) {
        if (collectionFilter === collection.id) setCollectionFilter("")
        setNotice({ kind: "success", message: `已删除收藏夹「${collection.name}」` })
        setDialog(null)
        loadCollections()
        loadItems()
      } else {
        setNotice({ kind: "error", message: resp?.error || "删除收藏夹失败" })
      }
    })
  }

  const assignSelectedToCollection = (collection: Collection) => {
    if (!selectedCount) return
    chrome.runtime.sendMessage(
      {
        type: "ASSIGN_COLLECTION",
        payload: { itemIds: selectedItems.map((item) => item.id), collectionId: collection.id },
      },
      (resp) => {
        if (resp?.success) {
          setNotice({ kind: "success", message: `已加入「${collection.name}」` })
          setDialog(null)
          clearSelection()
          loadItems()
        } else {
          setNotice({ kind: "error", message: resp?.error || "加入收藏夹失败" })
        }
      }
    )
  }

  const unassignSelectedFromCollection = () => {
    if (!selectedCount || !collectionFilter) return
    chrome.runtime.sendMessage(
      {
        type: "UNASSIGN_COLLECTION",
        payload: { itemIds: selectedItems.map((item) => item.id), collectionId: collectionFilter },
      },
      (resp) => {
        if (resp?.success) {
          setNotice({ kind: "success", message: "已从当前收藏夹移除" })
          clearSelection()
          loadItems()
        } else {
          setNotice({ kind: "error", message: resp?.error || "移除失败" })
        }
      }
    )
  }

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="3" y="9" width="13" height="10" rx="2.5" fill="#fff" opacity="0.55" />
              <rect x="6" y="3" width="13" height="10" rx="2.5" fill="#fff" />
            </svg>
          </div>
          <div>
            <div style={styles.brandName}>素材库</div>
            <div style={styles.brandSub}>MEDIA COLLECTOR</div>
          </div>
        </div>

        <SidebarGroup>
          <SidebarItem
            icon="grid"
            label="全部素材"
            count={items.length}
            active={scope === "all" && !platformFilter && !collectionFilter}
            onClick={() => selectScope("all")}
          />
          <SidebarItem
            icon="clock"
            label="最近采集"
            count={sidebarCounts.recent}
            active={scope === "recent"}
            onClick={() => selectScope("recent")}
          />
          <SidebarItem
            icon="bookmark"
            label="未分类"
            count={sidebarCounts.uncategorized}
            active={scope === "uncategorized"}
            onClick={() => selectScope("uncategorized")}
          />
        </SidebarGroup>

        <SidebarGroup
          title="我的收藏夹"
          actionLabel="+ 新建"
          onAction={() => setDialog({ type: "create" })}
        >
          {collections.length === 0 && (
            <div style={styles.sidebarEmpty}>还没有收藏夹</div>
          )}
          {collections.map((collection) => (
            <SidebarItem
              key={collection.id}
              dot={collection.color}
              label={collection.name}
              count={collectionCounts.get(collection.id) || 0}
              active={collectionFilter === collection.id}
              onClick={() => selectCollection(collection.id)}
              onRename={() => setDialog({ type: "rename", collection })}
              onDelete={() => setDialog({ type: "delete", collection })}
            />
          ))}
        </SidebarGroup>

        <SidebarGroup title="平台">
          <SidebarItem
            dot={theme.xhs}
            label="小红书"
            count={sidebarCounts.xhs}
            active={platformFilter === "xiaohongshu"}
            onClick={() => selectPlatform("xiaohongshu")}
          />
          <SidebarItem
            dot={theme.douyin}
            label="抖音"
            count={sidebarCounts.douyin}
            active={platformFilter === "douyin"}
            onClick={() => selectPlatform("douyin")}
          />
        </SidebarGroup>

        <div style={styles.sidebarFoot}>
          <div style={styles.proCard}>
            <div style={styles.proTitle}>
              <Icon name="plus" size={13} />
              升级 Pro
            </div>
            <div style={styles.proDesc}>解锁无限收藏夹、批量分文件夹导出、云端同步</div>
            <button className="mc-library-button" style={styles.proButton}>立即升级</button>
          </div>
        </div>
      </aside>

      <main style={styles.main}>
        <header style={styles.toolbar}>
          <h1 style={styles.title}>{pageTitle}</h1>
          <div style={styles.searchWrap}>
            <Icon name="search" size={16} style={styles.searchIcon} />
            <input
              ref={searchRef}
              style={styles.searchInput}
              placeholder="搜索标题、作者…  (⌘K)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="搜索素材"
            />
          </div>
          <div style={styles.toolbarSpacer} />
          <button
            className="mc-library-button"
            style={styles.toolbarButton}
            onClick={() => setSortDesc((current) => !current)}
          >
            <Icon name="filter" size={15} />
            {sortDesc ? "最新" : "最早"}
          </button>
          <div style={styles.viewToggle} role="group" aria-label="切换视图">
            <button
              className="mc-library-button"
              style={{ ...styles.viewButton, ...(viewMode === "grid" ? styles.viewButtonActive : {}) }}
              onClick={() => setViewMode("grid")}
              aria-label="网格视图"
              aria-pressed={viewMode === "grid"}
            >
              <Icon name="grid" size={15} />
            </button>
            <button
              className="mc-library-button"
              style={{ ...styles.viewButton, ...(viewMode === "list" ? styles.viewButtonActive : {}) }}
              onClick={() => setViewMode("list")}
              aria-label="列表视图"
              aria-pressed={viewMode === "list"}
            >
              <Icon name="list" size={15} />
            </button>
          </div>
        </header>

        <section style={styles.dashboard}>
          <DashboardCard icon="plus" label="今日采集" value={stats.today} unit="项" hint={stats.trend >= 0 ? `较昨日 +${stats.trend}%` : `较昨日 ${stats.trend}%`} positive />
          <DashboardCard icon="box" label="素材总量" value={stats.total} unit="项" hint={`图 ${stats.images} · 视频 ${stats.videos}`} />
          <DashboardCard icon="user" label="关注作者" value={stats.authorCount} unit="位" hint={stats.topAuthor ? `@${stats.topAuthor.name} 最多 (${stats.topAuthor.count})` : "暂无作者"} />
          <DashboardCard icon="download" label="本周已导出" value={stats.exportedThisWeek} unit="项" hint={stats.exportedThisWeek ? "高效产出中" : "等待导出记录"} positive={stats.exportedThisWeek > 0} />
        </section>

        <section style={styles.subbar}>
          <button className="mc-library-button" style={{ ...styles.chip, ...(platformFilter === "" ? styles.chipActive : {}) }} onClick={() => setPlatformFilter("")}>全部</button>
          <button className="mc-library-button" style={{ ...styles.chip, ...(platformFilter === "xiaohongshu" ? styles.chipXhsActive : {}) }} onClick={() => selectPlatform("xiaohongshu")}>小红书</button>
          <button className="mc-library-button" style={{ ...styles.chip, ...(platformFilter === "douyin" ? styles.chipDouyinActive : {}) }} onClick={() => selectPlatform("douyin")}>抖音</button>
          <button className="mc-library-button" style={{ ...styles.chip, ...(typeFilter === "image" ? styles.chipActive : {}) }} onClick={() => setTypeFilter((current) => (current === "image" ? "" : "image"))}>
            <Icon name="image" size={13} />
            图片
          </button>
          <button className="mc-library-button" style={{ ...styles.chip, ...(typeFilter === "video" ? styles.chipActive : {}) }} onClick={() => setTypeFilter((current) => (current === "video" ? "" : "video"))}>
            <Icon name="play" size={13} />
            视频
          </button>

          <div style={styles.bulkRight}>
            <button
              className="mc-library-button"
              style={{ ...styles.bulkGhost, ...(allCurrentSelected ? styles.bulkGhostActive : {}) }}
              onClick={toggleSelectAll}
              disabled={!sortedItems.length}
            >
              <Icon name="check" size={15} />
              {allCurrentSelected ? "取消全选" : "全选"}
            </button>
            <span style={styles.selectedText}>已选 <b>{selectedCount}</b> 项</span>
            <button
              className="mc-library-button"
              style={styles.bulkGhost}
              onClick={() => setDialog(collections.length ? { type: "assign" } : { type: "create" })}
              disabled={!selectedCount}
            >
              <Icon name="box" size={15} />
              {collections.length ? "加入收藏夹" : "新建收藏夹"}
            </button>
            {collectionFilter && (
              <button className="mc-library-button" style={styles.bulkGhost} onClick={unassignSelectedFromCollection} disabled={!selectedCount}>
                移出收藏夹
              </button>
            )}
            <button className="mc-library-button" style={{ ...styles.bulkPrimary, ...(batchDownloading || !selectedCount ? styles.disabled : {}) }} onClick={() => downloadItems(selectedItems)} disabled={batchDownloading || !selectedCount}>
              <Icon name="download" size={15} />
              {batchDownloading ? "导出中" : `导出 ${selectedCount || ""} 项`}
            </button>
            <button className="mc-library-button" style={{ ...styles.bulkDanger, ...(!selectedCount ? styles.disabled : {}) }} onClick={removeSelected} disabled={!selectedCount} aria-label="删除选中素材">
              <Icon name="trash" size={15} />
            </button>
          </div>
        </section>

        <section className="mc-library-scroll" style={styles.content}>
          {items.length === 0 ? (
            // M5 Task 3:全局无素材 — 大型引导(库页 1024+ 宽度)
            <div style={styles.emptyLarge}>
              <div style={styles.emptyIllust} aria-hidden="true">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </div>
              <div style={styles.emptyTitle}>还没有采集的素材</div>
              <div style={styles.emptySub}>打开小红书或抖音,点开任意一篇笔记,采集后回到这里查看</div>
            </div>
          ) : sortedItems.length === 0 ? (
            // M5 Task 3:有素材但筛选无结果 — 小型空状态 + 一键清空
            <div style={styles.emptySmall}>
              <div style={styles.emptyIllust} aria-hidden="true">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </div>
              <div style={styles.emptyTitle}>
                {collectionFilter ? "当前收藏夹暂无匹配素材" : "没有匹配的素材"}
              </div>
              {noMatchDesc && <div style={styles.emptySub}>{noMatchDesc}</div>}
              <button className="mc-library-button" style={styles.emptyAction} onClick={clearFilters}>
                清空筛选
              </button>
            </div>
          ) : viewMode === "grid" ? (
            TIME_ORDER.filter((bucket) => buckets.get(bucket)?.length).map((bucket) => (
              <div key={bucket} style={styles.timeSection}>
                <div style={styles.sectionTitle}>
                  <span>{bucket} · {buckets.get(bucket)?.length || 0} 项</span>
                </div>
                <div style={styles.grid}>
                  {(buckets.get(bucket) || []).map((item) => (
                    <LibraryCell
                      key={item.id}
                      item={item}
                      selected={selectedIds.has(item.id)}
                      imageCount={item.noteId ? noteImageCounts.get(item.noteId) : undefined}
                      onPreview={() => setPreviewItem(item)}
                      onToggleSelect={() => toggleItem(item)}
                      onDownload={() => downloadItems([item])}
                      onOpenSource={() => openSource(item)}
                    />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div style={styles.list}>
              {sortedItems.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onPreview={() => setPreviewItem(item)}
                  onToggleSelect={() => toggleItem(item)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {previewItem && (
        <PreviewModal
          item={previewItem}
          siblings={previewSiblings}
          onClose={() => setPreviewItem(null)}
          onNavigate={setPreviewItem}
        />
      )}

      {notice && (
        <LibraryToast
          notice={notice}
          onDismiss={() => setNotice(null)}
        />
      )}

      {dialog && (
        <CollectionDialog
          dialog={dialog}
          collections={collections}
          onClose={() => setDialog(null)}
          onCreate={createCollection}
          onRename={renameCollection}
          onDelete={deleteCollection}
          onAssign={assignSelectedToCollection}
        />
      )}
    </div>
  )

  function SidebarGroup({
    title,
    actionLabel,
    onAction,
    children,
  }: {
    title?: string
    actionLabel?: string
    onAction?: () => void
    children: React.ReactNode
  }) {
    return (
      <div style={styles.sidebarGroup}>
        {title && (
          <div style={styles.sidebarGroupHead}>
            <span>{title}</span>
            {actionLabel && (
              <button className="mc-library-button" style={styles.sidebarAction} onClick={onAction}>
                {actionLabel}
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    )
  }

  function SidebarItem({
    icon,
    dot,
    label,
    count,
    active,
    onClick,
    onRename,
    onDelete,
  }: {
    icon?: IconName
    dot?: string
    label: string
    count?: number
    active?: boolean
    onClick?: () => void
    onRename?: () => void
    onDelete?: () => void
  }) {
    return (
      <button
        className="mc-library-button"
        style={{ ...styles.sidebarItem, ...(active ? styles.sidebarItemActive : {}) }}
        onClick={onClick}
      >
        {icon && <Icon name={icon} size={16} />}
        {dot && <span style={{ ...styles.dot, background: dot.startsWith("linear-gradient") ? undefined : dot, backgroundImage: dot.startsWith("linear-gradient") ? dot : undefined }} />}
        <span style={styles.sidebarLabel}>{label}</span>
        {typeof count === "number" && <span style={styles.sidebarCount}>{count}</span>}
        {(onRename || onDelete) && (
          // M5 Task 4:侧栏"改/删"从 span role=button 改为真实 button,降低 screen reader / 键盘风险
          <span style={styles.sidebarActions}>
            {onRename && (
              <button
                type="button"
                style={styles.sidebarMini}
                aria-label={`重命名${label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onRename()
                }}
              >
                改
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                style={styles.sidebarMini}
                aria-label={`删除${label}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
              >
                删
              </button>
            )}
          </span>
        )}
      </button>
    )
  }

  function DashboardCard({
    icon,
    label,
    value,
    unit,
    hint,
    positive,
  }: {
    icon: IconName
    label: string
    value: number
    unit: string
    hint: string
    positive?: boolean
  }) {
    return (
      <div style={styles.dashCard}>
        <div style={styles.dashLabel}>
          <Icon name={icon} size={14} />
          {label}
        </div>
        <div style={styles.dashValue}>
          {value}
          <span style={styles.dashUnit}>{unit}</span>
        </div>
        <div style={{ ...styles.dashHint, ...(positive ? styles.positiveHint : {}) }}>
          {positive && "↑ "}
          {hint}
        </div>
      </div>
    )
  }
}

function LibraryCell({
  item,
  selected,
  imageCount,
  onPreview,
  onToggleSelect,
  onDownload,
  onOpenSource,
}: {
  item: MediaItem
  selected: boolean
  imageCount?: number
  onPreview: () => void
  onToggleSelect: () => void
  onDownload: () => void
  onOpenSource: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [imgError, setImgError] = useState(false)
  const cover = getDisplayCover(item)
  const isVideo = item.type === "video"
  const showCoverImage = cover && !imgError
  const showVideoFrame = isVideo && !cover && !imgError
  const showMultiBadge = !isVideo && imageCount && imageCount > 1
  const platformColor = item.platform === "xiaohongshu" ? theme.xhs : item.platform === "douyin" ? theme.douyin : theme.textTertiary

  return (
    <div
      className="mc-library-cell"
      style={{ ...styles.cell, ...(selected ? styles.cellSelected : {}) }}
      role="button"
      tabIndex={0}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleSelect()
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
          onPreview()
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
          onToggleSelect()
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
              onDownload()
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
                onOpenSource()
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
}

function LibraryRow({
  item,
  selected,
  onPreview,
  onToggleSelect,
}: {
  item: MediaItem
  selected: boolean
  onPreview: () => void
  onToggleSelect: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [imgError, setImgError] = useState(false)
  const cover = getDisplayCover(item)
  const isVideo = item.type === "video"
  const showCoverImage = cover && !imgError
  const showVideoFrame = isVideo && !cover && !imgError
  return (
    // M5 Task 4:列表行补 role=button + tabIndex + Enter/Space,与 LibraryCell 一致
    <div
      style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}
      role="button"
      tabIndex={0}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleSelect()
        }
      }}
      aria-label={`${selected ? "取消选择" : "选择"}素材 ${item.title || "未命名素材"}`}
      aria-pressed={selected}
    >
      <button
        type="button"
        style={{ ...styles.rowCheck, ...(selected ? styles.checkActive : {}) }}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
        aria-label={selected ? "取消选择该素材" : "选择该素材"}
      >
        {selected && <Icon name="check" size={13} />}
      </button>
      <button
        style={styles.rowThumbButton}
        onClick={(e) => {
          e.stopPropagation()
          onPreview()
        }}
        aria-label="预览该素材"
      >
        {showCoverImage ? (
          <img src={cover} alt="" style={styles.rowThumb} onError={() => setImgError(true)} />
        ) : showVideoFrame ? (
          <video
            src={item.url}
            style={styles.rowThumb}
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
          <div style={styles.rowPlaceholder} aria-hidden="true">
            <Icon name={isVideo ? "play" : "image"} size={17} fill={isVideo ? "currentColor" : "none"} />
          </div>
        )}
      </button>
      <button
        style={styles.rowMeta}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect()
        }}
      >
        <span style={styles.rowTitle}>{item.title || "未命名素材"}</span>
        <span style={styles.rowSub}>{item.author || "未分类"} · {PLATFORM_LABELS[item.platform]} · {item.type === "video" ? "视频" : "图片"}</span>
      </button>
      <span style={styles.rowDate}>{new Date(item.collectedAt).toLocaleDateString("zh-CN")}</span>
    </div>
  )
}

function getDisplayCover(item: MediaItem): string {
  if (item.type === "image") return item.url || item.coverUrl || ""
  return item.coverUrl || ""
}

function CollectionDialog({
  dialog,
  collections,
  onClose,
  onCreate,
  onRename,
  onDelete,
  onAssign,
}: {
  dialog: Exclude<DialogState, null>
  collections: Collection[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
  onRename: (collection: Collection, name: string) => void
  onDelete: (collection: Collection) => void
  onAssign: (collection: Collection) => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const colorOptions = [
    "#FF5A5F",
    "#5AC8FA",
    "#FFD60A",
    "#AF52DE",
    theme.xhs,
    theme.douyin,
  ]
  const [name, setName] = useState(dialog.type === "rename" ? dialog.collection.name : "")
  const [color, setColor] = useState(dialog.type === "rename" ? dialog.collection.color : colorOptions[0])
  // M5 Task 4:对话框打开时,Enter/Esc 快捷键 — capture 阶段拦截,避免与库页 keyboard handler 重复触发
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Enter" && (dialog.type === "create" || dialog.type === "rename")) {
        // 避免在 textarea / 颜色按钮激活时误触,只响应普通 input
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT") {
          e.preventDefault()
          if (dialog.type === "create") onCreate(name, color)
          else onRename(dialog.collection, name)
        }
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [dialog, name, color, onClose, onCreate, onRename])

  const title =
    dialog.type === "create"
      ? "新建收藏夹"
      : dialog.type === "rename"
        ? "重命名收藏夹"
        : dialog.type === "delete"
          ? "删除收藏夹"
          : "加入收藏夹"

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHead}>
          <div style={styles.dialogTitle}>{title}</div>
          <button style={styles.dialogClose} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {(dialog.type === "create" || dialog.type === "rename") && (
          <>
            <input
              style={styles.dialogInput}
              placeholder="收藏夹名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div style={styles.colorGrid}>
              {colorOptions.map((option) => (
                <button
                  key={option}
                  style={{
                    ...styles.colorButton,
                    background: option,
                    ...(color === option ? styles.colorButtonActive : {}),
                  }}
                  onClick={() => setColor(option)}
                  aria-label={`选择颜色 ${option}`}
                />
              ))}
            </div>
            <button
              className="mc-library-button"
              style={styles.dialogPrimary}
              onClick={() => {
                if (dialog.type === "create") onCreate(name, color)
                else onRename(dialog.collection, name)
              }}
            >
              {dialog.type === "create" ? "创建" : "保存"}
            </button>
          </>
        )}

        {dialog.type === "assign" && (
          <div style={styles.collectionList}>
            {collections.length === 0 ? (
              <div style={styles.dialogEmpty}>还没有收藏夹，先新建一个吧</div>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  className="mc-library-button"
                  style={styles.collectionChoice}
                  onClick={() => onAssign(collection)}
                >
                  <span style={{ ...styles.dot, background: collection.color }} />
                  <span>{collection.name}</span>
                </button>
              ))
            )}
          </div>
        )}

        {dialog.type === "delete" && (
          <>
            <div style={styles.dialogBody}>
              删除「{dialog.collection.name}」后，素材不会被删除，只会移出该收藏夹。
            </div>
            <div style={styles.dialogActions}>
              <button className="mc-library-button" style={styles.dialogGhost} onClick={onClose}>取消</button>
              <button className="mc-library-button" style={styles.dialogDanger} onClick={() => onDelete(dialog.collection)}>删除</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function LibraryToast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])

  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div style={styles.toast} role="status" aria-live="polite">
      <span style={{ ...styles.toastIcon, ...(notice.kind === "error" ? styles.toastIconError : {}) }}>
        <Icon name={notice.kind === "error" ? "trash" : "check"} size={13} />
      </span>
      <span style={styles.toastText}>{notice.message}</span>
      {notice.actionLabel && notice.onAction && (
        <button
          style={styles.toastAction}
          onClick={() => {
            notice.onAction?.()
            onDismiss()
          }}
        >
          {notice.actionLabel}
        </button>
      )}
    </div>
  )
}

function Icon({
  name,
  size = 16,
  fill = "none",
  style,
}: {
  name: IconName
  size?: number
  fill?: string
  style?: React.CSSProperties
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style,
    "aria-hidden": true,
  }

  switch (name) {
    case "box":
      return <svg {...common}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
    case "bookmark":
      return <svg {...common}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>
    case "check":
      return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    case "download":
      return <svg {...common}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
    case "external":
      return <svg {...common}><path d="M15 3h6v6" /><path d="M21 3l-9 9" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
    case "filter":
      return <svg {...common}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
    case "grid":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case "image":
      return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
    case "list":
      return <svg {...common}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
    case "plus":
      return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
    case "play":
      return <svg {...common}><polygon points="5 3 19 12 5 21 5 3" /></svg>
    case "search":
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
    case "trash":
      return <svg {...common}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
    case "user":
      return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>
    case "view":
      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
  }
}

function LibraryWithTheme() {
  return (
    <ThemeProvider initial="dark">
      <LibraryPage />
    </ThemeProvider>
  )
}

export default LibraryWithTheme

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => {
  // M5 Task 5:用 theme.* 替代硬编码 rgba,light 主题下不会失效
  const card = theme.card
  const cardHover = theme.cardHover
  const textTertiary = theme.textTertiary
  const green = "#30d158" // success 状态色,design-tokens 暂无对应,保留字面量

  return {
    shell: {
      width: "100vw",
      height: "100vh",
      display: "flex",
      overflow: "hidden",
      background: theme.bg,
      color: theme.textPrimary,
    },
    sidebar: {
      width: 248,
      flexShrink: 0,
      background: "#0d0d0f",
      borderRight: `1px solid ${theme.hairline}`,
      display: "flex",
      flexDirection: "column",
      padding: "20px 14px",
    },
    brand: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "4px 8px 20px",
    },
    logo: {
      width: 30,
      height: 30,
      borderRadius: theme.r.sm,
      background: `linear-gradient(135deg, ${theme.accentLight}, ${theme.accent})`,
      display: "grid",
      placeItems: "center",
      boxShadow: "0 4px 12px rgba(10,132,255,0.4)",
      flexShrink: 0,
    },
    brandName: {
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: -0.3,
      lineHeight: 1.05,
    },
    brandSub: {
      display: "block",
      fontSize: 10,
      fontWeight: 500,
      color: textTertiary,
      letterSpacing: 0.5,
      marginTop: 1,
    },
    sidebarGroup: {
      marginTop: 18,
      display: "flex",
      flexDirection: "column",
      gap: 2,
    },
    sidebarGroupHead: {
      fontSize: 11,
      fontWeight: 600,
      color: textTertiary,
      letterSpacing: 0.5,
      padding: "0 8px 8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sidebarAction: {
      border: "none",
      background: "transparent",
      color: theme.textTertiary,
      cursor: "pointer",
      padding: 0,
      fontSize: 11,
    },
    sidebarItem: {
      border: "none",
      background: "transparent",
      color: "rgba(255,255,255,0.68)",
      borderRadius: theme.r.sm,
      padding: "8px 9px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer",
      textAlign: "left",
      transition: `background ${theme.durFast} ${theme.easeOut}, color ${theme.durFast} ${theme.easeOut}`,
    },
    sidebarItemActive: {
      background: "rgba(10,132,255,0.16)",
      color: "#4da3ff",
      fontWeight: 600,
    },
    sidebarLabel: {
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: 13.5,
    },
    sidebarCount: {
      marginLeft: "auto",
      fontSize: 11,
      color: textTertiary,
      fontWeight: 600, // M5 Task 5:数字标签用 600(更醒目)
    },
    sidebarActions: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      marginLeft: 8,
    },
    sidebarMini: {
      fontSize: 10,
      color: textTertiary,
      border: `1px solid ${theme.hairlineSoft}`,
      borderRadius: theme.r.xs,
      padding: "2px 5px",
      lineHeight: 1,
      flexShrink: 0,
    },
    sidebarEmpty: {
      fontSize: 11,
      color: textTertiary,
      padding: "4px 8px 2px",
    },
    dot: {
      width: 9,
      height: 9,
      borderRadius: theme.r.pill,
      flexShrink: 0,
    },
    sidebarFoot: {
      marginTop: "auto",
      paddingTop: 14,
      borderTop: `1px solid ${theme.hairlineSoft}`,
    },
    proCard: {
      background: "linear-gradient(135deg, rgba(10,132,255,0.18), rgba(120,80,255,0.14))",
      border: "1px solid rgba(10,132,255,0.25)",
      borderRadius: theme.r.md,
      padding: 12,
    },
    proTitle: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 13,
      fontWeight: 700,
    },
    proDesc: {
      fontSize: 11,
      color: "rgba(255,255,255,0.68)",
      lineHeight: 1.4,
      margin: "5px 0 9px",
    },
    proButton: {
      width: "100%",
      border: "none",
      background: theme.accent,
      color: "#fff",
      fontWeight: 600,
      fontSize: 12,
      padding: 7,
      borderRadius: theme.r.sm,
      cursor: "pointer",
    },
    main: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      position: "relative",
      background: "radial-gradient(ellipse 60% 40% at 20% 0%, rgba(120,80,255,0.06), transparent 60%), #141416",
    },
    toolbar: {
      padding: "18px 28px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      // M5 Task 6:窄宽允许换行,避免标题/搜索框被挤
      flexWrap: "wrap",
      borderBottom: `1px solid ${theme.hairline}`,
      flexShrink: 0,
    },
    title: {
      margin: 0,
      fontSize: 22,
      fontWeight: 700,
      letterSpacing: -0.5,
      lineHeight: 1.1,
      minWidth: 92,
    },
    searchWrap: {
      flex: 1,
      minWidth: 220, // M5 Task 6:防止窄宽时搜索框被压成 0
      maxWidth: 420,
      position: "relative",
    },
    searchInput: {
      width: "100%",
      background: card,
      border: "1px solid transparent",
      borderRadius: theme.r.pill,
      padding: "9px 14px 9px 38px",
      color: theme.textPrimary,
      fontSize: 13.5,
      outline: "none",
      transition: `all ${theme.durFast} ${theme.easeOut}`,
    },
    searchIcon: {
      position: "absolute",
      left: 13,
      top: "50%",
      transform: "translateY(-50%)",
      color: textTertiary,
      pointerEvents: "none",
    },
    toolbarSpacer: { flex: 1 },
    toolbarButton: {
      border: "none",
      background: card,
      color: "rgba(255,255,255,0.68)",
      borderRadius: theme.r.sm,
      padding: "9px 13px",
      fontSize: 13,
      fontWeight: 600, // M5 Task 5:工具按钮用 600
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: 7,
      whiteSpace: "nowrap",
    },
    viewToggle: {
      display: "flex",
      background: card,
      borderRadius: theme.r.sm,
      padding: 2,
    },
    viewButton: {
      border: "none",
      background: "transparent",
      color: textTertiary,
      width: 30,
      height: 28,
      borderRadius: 6,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
    },
    viewButtonActive: {
      background: "rgba(255,255,255,0.14)",
      color: "#fff",
    },
    dashboard: {
      display: "grid",
      // M5 Task 6:auto-fit 自适应列数 — 1024+ 4 列,700-1024 2-3 列,<700 单列
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12,
      padding: "18px 28px 4px",
      flexShrink: 0,
    },
    dashCard: {
      background: card,
      border: `1px solid ${theme.hairlineSoft}`,
      borderRadius: theme.r.md,
      padding: "14px 16px",
      position: "relative",
      overflow: "hidden",
      minWidth: 0,
    },
    dashLabel: {
      fontSize: 12,
      color: textTertiary,
      display: "flex",
      alignItems: "center",
      gap: 6,
    },
    dashValue: {
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: -0.6,
      marginTop: 6,
      lineHeight: 1,
    },
    dashUnit: {
      fontSize: 13,
      fontWeight: 500,
      color: textTertiary,
      marginLeft: 3,
    },
    dashHint: {
      fontSize: 11,
      marginTop: 5,
      color: textTertiary,
      fontWeight: 600,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    positiveHint: { color: green },
    subbar: {
      padding: "14px 28px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      // M5 Task 6:窄宽让筛选 chip 与批量操作换行,避免重叠
      flexWrap: "wrap",
      flexShrink: 0,
    },
    chip: {
      fontSize: 12.5,
      fontWeight: 500,
      color: "rgba(255,255,255,0.68)",
      background: card,
      border: "none",
      padding: "6px 12px",
      borderRadius: theme.r.pill,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      height: 30,
    },
    chipActive: {
      color: "#fff",
      background: theme.accent,
    },
    chipXhsActive: {
      color: "#fff",
      background: theme.xhs,
    },
    chipDouyinActive: {
      color: "#062a29",
      background: theme.douyin,
    },
    bulkRight: {
      marginLeft: "auto",
      display: "flex",
      alignItems: "center",
      gap: 10,
    },
    selectedText: {
      fontSize: 13,
      color: "rgba(255,255,255,0.68)",
      whiteSpace: "nowrap",
    },
    bulkGhost: {
      border: "none",
      borderRadius: theme.r.sm,
      padding: "8px 15px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      background: card,
      color: "rgba(255,255,255,0.68)",
      whiteSpace: "nowrap",
    },
    bulkGhostActive: {
      background: "rgba(10,132,255,0.16)",
      color: "#4da3ff",
    },
    bulkPrimary: {
      border: "none",
      borderRadius: theme.r.sm,
      padding: "8px 15px",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      background: theme.accent,
      color: "#fff",
      boxShadow: "0 4px 14px rgba(10,132,255,0.35)",
      whiteSpace: "nowrap",
    },
    bulkDanger: {
      border: "none",
      borderRadius: theme.r.sm,
      padding: 8,
      width: 33,
      height: 33,
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: theme.dangerBg,
      color: theme.danger,
    },
    disabled: {
      opacity: 0.42,
      cursor: "default",
      boxShadow: "none",
    },
    content: {
      flex: 1,
      overflowY: "auto",
      padding: "4px 28px 40px",
      minHeight: 0,
    },
    timeSection: {
      marginBottom: 18,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: 600,
      color: textTertiary,
      letterSpacing: 0.3,
      margin: "18px 0 12px",
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: 14,
    },
    cell: {
      position: "relative",
      aspectRatio: "1",
      borderRadius: theme.r.md,
      overflow: "hidden",
      background: card,
      cursor: "pointer",
      transition: `transform ${theme.durFast} ${theme.easeOut}, box-shadow ${theme.durFast} ${theme.easeOut}`,
    },
    cellSelected: {
      outline: `3px solid ${theme.accent}`,
      outlineOffset: -3,
    },
    cellSelectedFrame: {
      position: "absolute",
      inset: 0,
      border: `3px solid ${theme.accent}`,
      borderRadius: theme.r.md,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.16)",
      pointerEvents: "none",
      zIndex: 4,
    },
    cellImage: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    },
    mediaPlaceholder: {
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      background: "linear-gradient(145deg, rgba(46,46,50,0.96), rgba(18,18,20,0.98))",
      color: "rgba(255,255,255,0.62)",
      fontSize: 12,
      fontWeight: 600,
    },
    mediaBadge: {
      position: "absolute",
      top: 8,
      left: 8,
      fontSize: 11,
      fontWeight: 700,
      color: "#fff",
      background: "rgba(0,0,0,0.55)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      padding: "3px 8px",
      borderRadius: theme.r.pill,
      display: "flex",
      alignItems: "center",
      gap: 4,
    },
    platformDot: {
      position: "absolute",
      top: 8,
      left: 8,
      width: 7,
      height: 7,
      borderRadius: theme.r.pill,
    },
    videoBadge: {
      position: "absolute",
      bottom: 8,
      right: 8,
      width: 24,
      height: 24,
      borderRadius: theme.r.pill,
      background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(6px)",
      WebkitBackdropFilter: "blur(6px)",
      display: "grid",
      placeItems: "center",
      color: "#fff",
    },
    previewAction: {
      position: "absolute",
      top: 8,
      right: 38,
      width: 28,
      height: 28,
      borderRadius: theme.r.pill,
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(0,0,0,0.46)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      color: "#fff",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      padding: 0,
      zIndex: 2,
      boxShadow: "0 4px 12px rgba(0,0,0,0.26)",
    },
    check: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 22,
      height: 22,
      borderRadius: theme.r.pill,
      border: "2px solid rgba(255,255,255,0.85)",
      background: "rgba(0,0,0,0.25)",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)",
      opacity: 1,
      transition: `all ${theme.durFast} ${theme.easeOut}`,
      display: "grid",
      placeItems: "center",
      color: "#fff",
      cursor: "pointer",
      padding: 0,
      zIndex: 5,
    },
    checkActive: {
      opacity: 1,
      background: theme.accent,
      borderColor: theme.accent,
      color: "#fff",
    },
    cellInfo: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: "22px 10px 9px",
      background: "linear-gradient(transparent, rgba(0,0,0,0.78))",
      opacity: 0,
      transition: `opacity ${theme.durFast} ${theme.easeOut}`,
      pointerEvents: "none",
    },
    cellAuthor: {
      fontSize: 11.5,
      fontWeight: 600,
      color: "#fff",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    cellActions: {
      display: "flex",
      gap: 6,
      marginTop: 7,
      pointerEvents: "auto",
    },
    miniAction: {
      width: 26,
      height: 26,
      borderRadius: 7,
      background: "rgba(255,255,255,0.16)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      border: "none",
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      color: "#fff",
    },
    list: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
      paddingTop: 10,
    },
    row: {
      minHeight: 64,
      borderRadius: theme.r.md,
      background: card,
      border: `1px solid ${theme.hairlineSoft}`,
      display: "grid",
      gridTemplateColumns: "34px 48px minmax(0, 1fr) 110px",
      alignItems: "center",
      gap: 12,
      padding: "8px 12px",
    },
    rowSelected: {
      borderColor: theme.accent,
      background: "rgba(10,132,255,0.10)",
    },
    rowCheck: {
      width: 22,
      height: 22,
      borderRadius: theme.r.pill,
      border: "2px solid rgba(255,255,255,0.55)",
      background: "transparent",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      cursor: "pointer",
      padding: 0,
    },
    rowThumbButton: {
      width: 48,
      height: 48,
      border: "none",
      padding: 0,
      borderRadius: theme.r.sm,
      overflow: "hidden",
      background: cardHover,
      cursor: "pointer",
    },
    rowThumb: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    },
    rowPlaceholder: {
      width: "100%",
      height: "100%",
      display: "grid",
      placeItems: "center",
      background: "linear-gradient(145deg, rgba(46,46,50,0.96), rgba(18,18,20,0.98))",
      color: "rgba(255,255,255,0.62)",
    },
    rowMeta: {
      minWidth: 0,
      textAlign: "left",
      border: "none",
      background: "transparent",
      color: theme.textPrimary,
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    },
    rowTitle: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: 13,
      fontWeight: 600,
    },
    rowSub: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontSize: 12,
      color: textTertiary,
    },
    rowDate: {
      fontSize: 12,
      color: textTertiary,
      textAlign: "right",
    },
    // M5 Task 3:空状态视觉分两档(大:全库无素材 / 小:筛选无结果)
    emptyLarge: {
      height: "100%",
      minHeight: 360,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: 24,
    },
    emptySmall: {
      height: "100%",
      minHeight: 240,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      padding: 24,
      gap: 6,
    },
    emptyIllust: {
      width: 72,
      height: 72,
      borderRadius: theme.r.md,
      background: theme.card,
      border: `0.5px solid ${theme.hairline}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: theme.textSecondary,
      marginBottom: theme.sp.md,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: 600,
      letterSpacing: -0.2,
      color: theme.textPrimary,
      marginBottom: 4,
    },
    emptySub: {
      fontSize: 13,
      color: textTertiary,
      lineHeight: 1.5,
      maxWidth: 420,
    },
    emptyAction: {
      marginTop: theme.sp.md,
      height: 34,
      padding: "0 16px",
      border: "none",
      borderRadius: theme.r.sm,
      background: theme.accent,
      color: "#fff",
      fontWeight: 600,
      fontSize: 13,
      cursor: "pointer",
    },
    dialogOverlay: {
      position: "fixed",
      inset: 0,
      zIndex: 130,
      background: "rgba(0,0,0,0.48)",
      backdropFilter: theme.glassBlur,
      WebkitBackdropFilter: theme.glassBlur,
      display: "grid",
      placeItems: "center",
      padding: 24,
    },
    dialog: {
      width: 360,
      maxWidth: "100%",
      background: "rgba(40,40,42,0.96)",
      border: `1px solid ${theme.hairline}`,
      borderRadius: theme.r.lg,
      boxShadow: theme.shadowFloat,
      padding: 16,
      color: "#fff",
    },
    dialogHead: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },
    dialogTitle: {
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: -0.3,
    },
    dialogClose: {
      width: 28,
      height: 28,
      borderRadius: theme.r.pill,
      border: "none",
      background: card,
      color: theme.textSecondary,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      fontSize: 18,
      lineHeight: 1,
    },
    dialogInput: {
      width: "100%",
      height: 38,
      border: `1px solid ${theme.hairline}`,
      background: card,
      color: "#fff",
      borderRadius: theme.r.sm,
      padding: "0 12px",
      outline: "none",
      marginBottom: 12,
    },
    colorGrid: {
      display: "flex",
      gap: 8,
      marginBottom: 14,
    },
    colorButton: {
      width: 26,
      height: 26,
      borderRadius: theme.r.pill,
      border: "2px solid transparent",
      cursor: "pointer",
    },
    colorButtonActive: {
      borderColor: "#fff",
      boxShadow: `0 0 0 2px ${theme.accent}`,
    },
    dialogPrimary: {
      width: "100%",
      height: 36,
      border: "none",
      borderRadius: theme.r.sm,
      background: theme.accent,
      color: "#fff",
      fontWeight: 600,
      cursor: "pointer",
    },
    collectionList: {
      display: "flex",
      flexDirection: "column",
      gap: 8,
    },
    collectionChoice: {
      height: 38,
      border: `1px solid ${theme.hairlineSoft}`,
      borderRadius: theme.r.sm,
      background: card,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "0 12px",
      cursor: "pointer",
      textAlign: "left",
    },
    dialogEmpty: {
      padding: "18px 8px",
      textAlign: "center",
      color: textTertiary,
      fontSize: 13,
    },
    dialogBody: {
      color: theme.textSecondary,
      fontSize: 13,
      lineHeight: 1.5,
      marginBottom: 14,
    },
    dialogActions: {
      display: "flex",
      justifyContent: "flex-end",
      gap: 8,
    },
    dialogGhost: {
      height: 34,
      border: "none",
      borderRadius: theme.r.sm,
      background: card,
      color: theme.textSecondary,
      padding: "0 14px",
      cursor: "pointer",
    },
    dialogDanger: {
      height: 34,
      border: "none",
      borderRadius: theme.r.sm,
      background: theme.dangerBg,
      color: theme.danger,
      padding: "0 14px",
      cursor: "pointer",
      fontWeight: 600,
    },
    toast: {
      position: "fixed",
      bottom: 24,
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(40,40,42,0.92)",
      backdropFilter: "blur(30px)",
      WebkitBackdropFilter: "blur(30px)",
      border: `1px solid ${theme.hairline}`,
      borderRadius: theme.r.md,
      padding: "12px 18px",
      display: "flex",
      alignItems: "center",
      gap: 14,
      boxShadow: theme.shadowFloat,
      fontSize: 13,
      zIndex: 120,
      color: "#fff",
    },
    toastIcon: {
      width: 22,
      height: 22,
      borderRadius: theme.r.pill,
      background: green,
      color: "#062a10",
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    },
    toastIconError: {
      background: theme.danger,
      color: "#fff",
    },
    toastText: {
      whiteSpace: "nowrap",
    },
    toastAction: {
      border: "none",
      background: "transparent",
      color: theme.accent,
      fontWeight: 600,
      cursor: "pointer",
      padding: 0,
    },
  }
}
