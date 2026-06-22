import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, ExportHistoryEntry, MediaItem, MediaType, Platform } from "../types"
import { PLATFORM_LABELS } from "../types"
import { getTimeBucket, TIME_ORDER, type ThemeTokens } from "../lib/design-tokens"
import { makeStyles } from "../lib/library-styles"
import { ThemeProvider, useTheme } from "../lib/use-theme"
import { PreviewModal } from "../components/PreviewModal"
import { buildExportPath, summarizeExportFolders, type ExportContext } from "../lib/export-path"

type Scope = "all" | "recent" | "uncategorized"
type ViewMode = "grid" | "list"

// M6 Task 3:预计算字段 — items 一次性派生,下游 useMemo 复用,避免重复 new Date()/字符串拼
// 内部计算字段以下划线开头,不入 storage(纯内存对象,源自 useMemo)
type EnrichedItem = MediaItem & {
  _collectedAtMs: number
  _timeBucket: string
  _searchHaystack: string
}

// M6 Task 2:渐进渲染配置
const INITIAL_RENDER_COUNT = 160
const RENDER_INCREMENT = 120
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
  // loadHistory 启动时拉一次(挂在主 useEffect 内)
  const [notice, setNotice] = useState<Notice | null>(null)
  // M6 Task 4:导出历史 modal
  const [history, setHistory] = useState<ExportHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const loadHistory = useCallback(() => {
    try {
      chrome.runtime.sendMessage({ type: "GET_EXPORT_HISTORY" }, (resp) => {
        if (chrome.runtime.lastError || !resp?.success) return
        setHistory((resp.history as ExportHistoryEntry[]) || [])
      })
    } catch {
      // 防御性兜底:即使 sendMessage 抛错也不影响库页
    }
  }, [])
  // 历史有失败项的总和(用于按钮角标)
  const failedHistoryCount = useMemo(
    () => history.reduce((sum, h) => sum + (h.failedCount || 0), 0),
    [history]
  )
  const [dialog, setDialog] = useState<DialogState>(null)
  const [batchDownloading, setBatchDownloading] = useState(false)
  // M6 Task 2:渐进渲染——只渲染前 N 项,滚动接近底部再追加
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)

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
    loadHistory()
  }, [loadCollections, loadItems, loadHistory])

  // M5 Task 4 + M6 Task 6:库页快捷键补齐
  // 用 handlerRef 模式避免 useEffect deps 数组引用未初始化的 const(TDZ)
  // - Cmd/Ctrl+K 聚焦搜索(任何时候)
  // - Esc 优先级 对话框 > 预览 > 搜索
  // - Cmd/Ctrl+A 全选(输入态不拦截)
  // - Delete/Backspace 删除(走撤销 Toast,输入态不拦截)
  // - E 导出(非输入态)
  // - C 打开加入收藏夹 dialog(非输入态)
  const keyboardHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyboardHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const isTyping =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable === true

    // Cmd/Ctrl+K:聚焦搜索(任何时候都生效)
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault()
      searchRef.current?.focus()
      return
    }

    // Esc:关闭对话框 > 关闭预览 > 清空搜索
    if (e.key === "Escape") {
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
      return
    }

    // 输入态下,以下快捷键全部不拦截
    if (isTyping) return

    // Cmd/Ctrl+A:全选当前筛选结果
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault()
      toggleSelectAll()
      return
    }

    // Delete / Backspace:删除选中(走撤销 Toast)
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedCount > 0 && !batchDownloading) {
        e.preventDefault()
        removeSelected()
      }
      return
    }

    // E:导出选中
    if (e.key === "e" || e.key === "E") {
      if (selectedCount > 0 && !batchDownloading) {
        e.preventDefault()
        downloadItems(selectedItems)
      }
      return
    }

    // C:打开加入收藏夹 / 移动到收藏夹 dialog
    if (e.key === "c" || e.key === "C") {
      if (selectedCount > 0) {
        e.preventDefault()
        setDialog(collections.length ? { type: "assign" } : { type: "create" })
      }
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyboardHandlerRef.current(e)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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

  // M6 Task 3:预计算 — items 变化时一次性算出 collectedAtMs / timeBucket / searchHaystack
  // 下游 useMemo(stats / authors / filteredItems / sortedItems / buckets / visibleBuckets)复用,避免重复 new Date()
  const enrichedItems = useMemo<EnrichedItem[]>(() => {
    return items.map((item) => ({
      ...item,
      _collectedAtMs: +new Date(item.collectedAt),
      _timeBucket: getTimeBucket(item.collectedAt),
      _searchHaystack: `${item.title || ""} ${item.author || ""}`.toLowerCase(),
    }))
  }, [items])

  // M6 Task 5:侧栏收藏夹排序 — pinned 在前 / sortOrder 小的在前 / sortOrder 相同时 createdAt 倒序
  const sortedCollections = useMemo(() => {
    return [...collections].sort((a, b) => {
      const aPinned = a.pinned ?? false
      const bPinned = b.pinned ?? false
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      const aOrder = a.sortOrder ?? 0
      const bOrder = b.sortOrder ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      return +new Date(b.createdAt) - +new Date(a.createdAt)
    })
  }, [collections])

  const authors = useMemo(() => {
    const map = new Map<string, { name: string; count: number; first: MediaItem }>()
    // M6 Task 3:用 enrichedItems._collectedAtMs 替代 +new Date
    const sorted = [...enrichedItems].sort((a, b) => b._collectedAtMs - a._collectedAtMs)
    for (const item of sorted) {
      const key = item.author || ""
      const current = map.get(key)
      if (current) current.count += 1
      else map.set(key, { name: key, count: 1, first: item })
    }
    return [...map.values()].sort((a, b) => (a.name === "" ? 1 : b.name === "" ? -1 : b.count - a.count))
  }, [enrichedItems])

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

    // M6 Task 3:用 enrichedItems._collectedAtMs 替代 +new Date(item.collectedAt)
    for (const item of enrichedItems) {
      const collectedAt = item._collectedAtMs
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
    // M6 Task 3:用 enrichedItems 复用 _timeBucket,避免重复 getTimeBucket 调用
    return {
      recent: enrichedItems.filter((item) => item._timeBucket === "今天").length,
      uncategorized: enrichedItems.filter((item) => !item.collectionIds?.length).length,
      xhs: enrichedItems.filter((item) => item.platform === "xiaohongshu").length,
    }
  }, [enrichedItems])

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
    // M6 Task 3:用 enrichedItems 复用 _timeBucket / _searchHaystack,避免每个 item 重复 getTimeBucket + 拼字符串
    return enrichedItems.filter((item) => {
      if (scope === "recent" && item._timeBucket !== "今天") return false
      if (scope === "uncategorized" && item.collectionIds?.length) return false
      if (collectionFilter && !item.collectionIds?.includes(collectionFilter)) return false
      if (platformFilter && item.platform !== platformFilter) return false
      if (typeFilter && item.type !== typeFilter) return false
      if (q && !item._searchHaystack.includes(q)) return false
      return true
    })
  }, [collectionFilter, enrichedItems, platformFilter, scope, search, typeFilter])

  const sortedItems = useMemo(() => {
    // M6 Task 3:用 _collectedAtMs 替代 +new Date(...)
    return [...filteredItems].sort((a, b) => {
      const diff = b._collectedAtMs - a._collectedAtMs
      return sortDesc ? diff : -diff
    })
  }, [filteredItems, sortDesc])

  const buckets = useMemo(() => {
    // M6 Task 3:用 _timeBucket 替代 getTimeBucket(item.collectedAt)
    const map = new Map<string, EnrichedItem[]>()
    for (const item of sortedItems) {
      const arr = map.get(item._timeBucket)
      if (arr) arr.push(item)
      else map.set(item._timeBucket, [item])
    }
    return map
  }, [sortedItems])

  // M6 Task 2:渐进渲染——只渲染前 renderLimit 项
  const visibleItems = useMemo(() => sortedItems.slice(0, renderLimit), [sortedItems, renderLimit])
  const visibleBuckets = useMemo(() => {
    // M6 Task 3:用 _timeBucket 替代 getTimeBucket(item.collectedAt)
    const map = new Map<string, EnrichedItem[]>()
    for (const item of visibleItems) {
      const arr = map.get(item._timeBucket)
      if (arr) arr.push(item)
      else map.set(item._timeBucket, [item])
    }
    return map
  }, [visibleItems])

  // 筛选/搜索/排序/视图变化时重置 renderLimit
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_COUNT)
  }, [search, scope, collectionFilter, platformFilter, typeFilter, sortDesc, viewMode])

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
              ? `已导出 ${okCount} / ${targets.length} 项到 ${folderText}，${failed} 项失败（${(resp.errors || []).slice(0, 2).join("；")}）`
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
            message: resp?.errors?.[0] || "导出失败，请确保小红书页面可访问",
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

  // M6 Task 3:稳定 callback(给 LibraryCell / LibraryRow 用),让 React.memo 真正生效
  // 4 个 callback 接受 item 参数,内部直接调用原函数,引用稳定 → 父级 re-render 时子组件不重渲染
  // 依赖 [] 是安全的:内部用 setSelectedIds / chrome.runtime.sendMessage / chrome.tabs.create,都是稳定 API,stale closure 无害
  const handlePreviewItem = useCallback((item: MediaItem) => setPreviewItem(item), [])
  const handleToggleItem = useCallback((item: MediaItem) => toggleItem(item), [])
  const handleDownloadOne = useCallback((item: MediaItem) => downloadItems([item]), [])
  const handleOpenSource = useCallback((item: MediaItem) => openSource(item), [])

  const createCollection = (name: string, color: string) => {
    const trimmed = name.trim()
    if (!trimmed) {
      setNotice({ kind: "error", message: "收藏夹名称不能为空" })
      return
    }
    if (collections.some((collection) => collection.name === trimmed)) {
      setNotice({ kind: "error", message: "收藏夹已存在" })
      return
    }
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

  // M6 Task 5:编辑收藏夹(name + color + pinned 一起保存,3 个 message 串行写)
  const updateCollection = (collection: Collection, next: { name: string; color: string; pinned: boolean }) => {
    const trimmed = next.name.trim()
    if (!trimmed) {
      setNotice({ kind: "error", message: "收藏夹名称不能为空" })
      return
    }
    if (trimmed !== collection.name && collections.some((c) => c.name === trimmed)) {
      setNotice({ kind: "error", message: "收藏夹已存在" })
      return
    }
    const tasks: Array<() => Promise<boolean>> = []
    if (trimmed !== collection.name) {
      tasks.push(
        () =>
          new Promise<boolean>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "RENAME_COLLECTION", payload: { id: collection.id, name: trimmed } },
              (resp: { success?: boolean } | undefined) => resolve(resp?.success === true)
            )
          })
      )
    }
    if (next.color !== collection.color) {
      tasks.push(
        () =>
          new Promise<boolean>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "UPDATE_COLLECTION_COLOR", payload: { id: collection.id, color: next.color } },
              (resp: { success?: boolean } | undefined) => resolve(resp?.success === true)
            )
          })
      )
    }
    if (next.pinned !== (collection.pinned ?? false)) {
      tasks.push(
        () =>
          new Promise<boolean>((resolve) => {
            chrome.runtime.sendMessage(
              { type: "PIN_COLLECTION", payload: { id: collection.id, pinned: next.pinned } },
              (resp: { success?: boolean } | undefined) => resolve(resp?.success === true)
            )
          })
      )
    }
    if (!tasks.length) {
      setDialog(null)
      return
    }
    ;(async () => {
      for (const task of tasks) {
        const ok = await task()
        if (!ok) {
          setNotice({ kind: "error", message: "更新失败" })
          return
        }
      }
      setNotice({ kind: "success", message: "已更新收藏夹" })
      setDialog(null)
      loadCollections()
    })()
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
    const itemIds = selectedItems.map((item) => item.id)
    // M6 Task 5:当前在某个收藏夹视图中 → 走 MOVE(从源移除并加入目标)
    // 不在收藏夹视图 → 走 ASSIGN(加入新归属,保留多归属)
    if (collectionFilter) {
      chrome.runtime.sendMessage(
        {
          type: "MOVE_COLLECTION_ITEMS",
          payload: {
            itemIds,
            fromCollectionId: collectionFilter,
            toCollectionId: collection.id,
          },
        },
        (resp) => {
          if (resp?.success) {
            setNotice({ kind: "success", message: `已移动 ${resp.movedCount ?? itemIds.length} 项到「${collection.name}」` })
            setDialog(null)
            clearSelection()
            loadItems()
          } else {
            setNotice({ kind: "error", message: resp?.error || "移动失败" })
          }
        }
      )
      return
    }
    chrome.runtime.sendMessage(
      {
        type: "ASSIGN_COLLECTION",
        payload: { itemIds, collectionId: collection.id },
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
          {sortedCollections.length === 0 && (
            <div style={styles.sidebarEmpty}>还没有收藏夹</div>
          )}
          {sortedCollections.map((collection) => (
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
        </SidebarGroup>

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
          {/* M6 Task 4:导出历史按钮 — 带失败数角标(失败时高亮) */}
          <button
            className="mc-library-button"
            style={{
              ...styles.toolbarButton,
              ...(failedHistoryCount > 0 ? styles.toolbarButtonAlert : {}),
            }}
            onClick={() => {
              loadHistory()
              setShowHistory(true)
            }}
            aria-label={`导出历史,共 ${history.length} 条${failedHistoryCount ? `, ${failedHistoryCount} 项失败` : ""}`}
          >
            <Icon name="clock" size={15} />
            导出历史
            {history.length > 0 && (
              <span style={styles.toolbarBadge}>{history.length}</span>
            )}
            {failedHistoryCount > 0 && (
              <span style={styles.toolbarBadgeAlert}>!</span>
            )}
          </button>
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
          <button className="mc-library-button" style={{ ...styles.chip, ...(typeFilter === "image" ? styles.chipActive : {}) }} onClick={() => setTypeFilter((current) => (current === "image" ? "" : "image"))}>
            <Icon name="image" size={13} />
            图片
          </button>
          <button className="mc-library-button" style={{ ...styles.chip, ...(typeFilter === "video" ? styles.chipActive : {}) }} onClick={() => setTypeFilter((current) => (current === "video" ? "" : "video"))}>
            <Icon name="play" size={13} />
            视频
          </button>

          <div style={styles.bulkRight}>
            {/* M6 Task 2.6:渐进渲染时显示"已显示 X / N 项",全部加载完显示"共 N 项" */}
            <span style={styles.subbarCount}>
              {visibleItems.length < sortedItems.length
                ? `已显示 ${visibleItems.length} / ${sortedItems.length} 项`
                : `共 ${sortedItems.length} 项`}
            </span>
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
              {/* M6 Task 5:在收藏夹视图中显示"移动到..." — 暗示从源移除 */}
              {collectionFilter
                ? "移动到..."
                : collections.length
                  ? "加入收藏夹"
                  : "新建收藏夹"}
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

        <section
          className="mc-library-scroll"
          style={styles.content}
          onScroll={(e) => {
            const el = e.currentTarget
            // 滚动接近底部时追加渲染(M6 Task 2)
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 480) {
              setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length))
            }
          }}
        >
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
              <div style={styles.emptySub}>打开小红书,点开任意一篇笔记,采集后回到这里查看</div>
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
            TIME_ORDER.filter((bucket) => buckets.get(bucket)?.length).map((bucket) => {
              const allInBucket = buckets.get(bucket)?.length || 0
              const visibleInBucket = visibleBuckets.get(bucket) || []
              return (
                <div key={bucket} style={styles.timeSection}>
                  <div style={styles.sectionTitle}>
                    <span>{bucket} · {allInBucket} 项</span>
                    {visibleInBucket.length < allInBucket && (
                      <span style={styles.sectionPartial}>已显示 {visibleInBucket.length} / {allInBucket}</span>
                    )}
                  </div>
                  <div style={styles.grid}>
                    {visibleInBucket.map((item) => (
                      <LibraryCell
                        key={item.id}
                        item={item}
                        selected={selectedIds.has(item.id)}
                        imageCount={item.noteId ? noteImageCounts.get(item.noteId) : undefined}
                        onPreview={handlePreviewItem}
                        onToggleSelect={handleToggleItem}
                        onDownload={handleDownloadOne}
                        onOpenSource={handleOpenSource}
                      />
                    ))}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={styles.list}>
              {visibleItems.map((item) => (
                <LibraryRow
                  key={item.id}
                  item={item}
                  selected={selectedIds.has(item.id)}
                  onPreview={handlePreviewItem}
                  onToggleSelect={handleToggleItem}
                />
              ))}
            </div>
          )}

          {/* M6 Task 2:渐进渲染兜底——还有未渲染项时显示"显示更多" */}
          {visibleItems.length < sortedItems.length && (
            <div style={styles.loadMoreWrap}>
              <button
                className="mc-library-button"
                style={styles.loadMoreBtn}
                onClick={() => setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length))}
              >
                继续加载({sortedItems.length - visibleItems.length} 项)
              </button>
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

      {/* M6 Task 4:导出历史 modal */}
      {showHistory && (
        <ExportHistoryModal
          history={history}
          onClose={() => setShowHistory(false)}
          onRetry={(files) => {
            setShowHistory(false)
            chrome.runtime.sendMessage(
              { type: "RETRY_EXPORT_FAILED", payload: { files } },
              (resp) => {
                if (resp?.success) {
                  const ok = resp.count ?? files.length
                  const failed = resp.errors?.length ?? 0
                  setNotice({
                    kind: failed > 0 ? "info" : "success",
                    message: failed > 0 ? `重试完成 ${ok}/${files.length} 成功` : `重试完成 ${ok} 项`,
                  })
                } else {
                  setNotice({ kind: "error", message: resp?.error || "重试失败" })
                }
                loadHistory()
              }
            )
          }}
          onClear={() => {
            chrome.runtime.sendMessage({ type: "CLEAR_EXPORT_HISTORY" }, () => {
              setHistory([])
              setNotice({ kind: "success", message: "已清空导出历史" })
            })
          }}
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
          onUpdate={updateCollection}
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
      // M6 Task 3 修复:外层用 div + role=button,避免 button 嵌套 button(改/删)
      // 原 <button> 包裹两个 <button> 违反 HTML 规范,React 报 validateDOMNesting 警告
      // div + role=button + tabIndex + Enter/Space 与 LibraryCell / LibraryRow 保持一致
      <div
        className="mc-library-button"
        style={{ ...styles.sidebarItem, ...(active ? styles.sidebarItemActive : {}) }}
        role="button"
        tabIndex={0}
        aria-pressed={active}
        onClick={onClick}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && onClick) {
            e.preventDefault()
            onClick()
          }
        }}
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
      </div>
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

// M6 Task 3:React.memo 包裹 + callback 接受 item 参数(外部传稳定 useCallback 引用,memo 才能生效)
const LibraryCell = memo(function LibraryCell({
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
  onPreview: (item: MediaItem) => void
  onToggleSelect: (item: MediaItem) => void
  onDownload: (item: MediaItem) => void
  onOpenSource: (item: MediaItem) => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const [imgError, setImgError] = useState(false)
  const cover = getDisplayCover(item)
  const isVideo = item.type === "video"
  const showCoverImage = cover && !imgError
  const showVideoFrame = isVideo && !cover && !imgError
  const showMultiBadge = !isVideo && imageCount && imageCount > 1
  const platformColor = item.platform === "xiaohongshu" ? theme.xhs : theme.textTertiary

  return (
    <div
      className="mc-library-cell"
      style={{ ...styles.cell, ...(selected ? styles.cellSelected : {}) }}
      role="button"
      tabIndex={0}
      onClick={() => onToggleSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleSelect(item)
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
          onPreview(item)
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
          onToggleSelect(item)
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
              onDownload(item)
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
                onOpenSource(item)
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
})

// M6 Task 3:React.memo 包裹 + callback 接受 item 参数
const LibraryRow = memo(function LibraryRow({
  item,
  selected,
  onPreview,
  onToggleSelect,
}: {
  item: MediaItem
  selected: boolean
  onPreview: (item: MediaItem) => void
  onToggleSelect: (item: MediaItem) => void
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
      onClick={() => onToggleSelect(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleSelect(item)
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
          onToggleSelect(item)
        }}
        aria-label={selected ? "取消选择该素材" : "选择该素材"}
      >
        {selected && <Icon name="check" size={13} />}
      </button>
      <button
        style={styles.rowThumbButton}
        onClick={(e) => {
          e.stopPropagation()
          onPreview(item)
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
          onToggleSelect(item)
        }}
      >
        <span style={styles.rowTitle}>{item.title || "未命名素材"}</span>
        <span style={styles.rowSub}>{item.author || "未分类"} · {PLATFORM_LABELS[item.platform]} · {item.type === "video" ? "视频" : "图片"}</span>
      </button>
      <span style={styles.rowDate}>{new Date(item.collectedAt).toLocaleDateString("zh-CN")}</span>
    </div>
  )
})

function getDisplayCover(item: MediaItem): string {
  if (item.type === "image") return item.url || item.coverUrl || ""
  return item.coverUrl || ""
}

function CollectionDialog({
  dialog,
  collections,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onAssign,
}: {
  dialog: Exclude<DialogState, null>
  collections: Collection[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
  // M6 Task 5:rename dialog 改"编辑收藏夹",一次保存 name + color + pinned
  onUpdate: (collection: Collection, next: { name: string; color: string; pinned: boolean }) => void
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
  ]
  const [name, setName] = useState(dialog.type === "rename" ? dialog.collection.name : "")
  const [color, setColor] = useState(dialog.type === "rename" ? dialog.collection.color : colorOptions[0])
  // M6 Task 5:置顶状态(仅 rename 模式有意义)
  const [pinned, setPinned] = useState(
    dialog.type === "rename" ? dialog.collection.pinned ?? false : false
  )

  // 对话框每次打开/切换类型时都重置内部表单状态,避免残留上一次编辑内容
  useEffect(() => {
    setName(dialog.type === "rename" ? dialog.collection.name : "")
    setColor(dialog.type === "rename" ? dialog.collection.color : colorOptions[0])
    setPinned(dialog.type === "rename" ? dialog.collection.pinned ?? false : false)
  }, [dialog, colorOptions])

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
          else onUpdate(dialog.collection, { name, color, pinned })
        }
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [dialog, name, color, pinned, onClose, onCreate, onUpdate])

  const title =
    dialog.type === "create"
      ? "新建收藏夹"
      : dialog.type === "rename"
        ? "编辑收藏夹"
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
            {/* M6 Task 5:置顶 toggle — 仅 rename 模式(创建时新 collection 排序按 max+1 自动放最后,无需置顶) */}
            {dialog.type === "rename" && (
              <label style={styles.pinRow}>
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  aria-label="置顶该收藏夹"
                />
                <span>置顶到侧栏最前</span>
              </label>
            )}
            <button
              className="mc-library-button"
              style={styles.dialogPrimary}
              onClick={() => {
                if (dialog.type === "create") onCreate(name, color)
                else onUpdate(dialog.collection, { name, color, pinned })
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

// M6 Task 4:导出历史 modal
function ExportHistoryModal({
  history,
  onClose,
  onRetry,
  onClear,
}: {
  history: ExportHistoryEntry[]
  onClose: () => void
  onRetry: (files: Array<{ id?: string; url: string; filename: string; platform?: Platform }>) => void
  onClear: () => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [onClose])

  // 仅展示最近 10 条
  const recent = history.slice(0, 10)
  const totalFailed = history.reduce((s, h) => s + (h.failedCount || 0), 0)

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div
        style={{ ...styles.dialog, maxWidth: 520, width: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.dialogHead}>
          <div style={styles.dialogTitle}>
            导出历史
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "inherit", opacity: 0.6 }}>
              共 {history.length} 条{totalFailed > 0 ? `, ${totalFailed} 项失败` : ""}
            </span>
          </div>
          <button style={styles.dialogClose} onClick={onClose} aria-label="关闭">×</button>
        </div>

        {recent.length === 0 ? (
          <div style={styles.dialogEmpty}>还没有导出记录</div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1, padding: "0 4px" }}>
            {recent.map((entry) => (
              <div key={entry.id} style={styles.historyItem}>
                <div style={styles.historyItemHead}>
                  <span style={styles.historyTime}>
                    {new Date(entry.createdAt).toLocaleString("zh-CN", { hour12: false })}
                  </span>
                  <span
                    style={{
                      ...styles.historyStatus,
                      ...(entry.failedCount > 0 ? styles.historyStatusPartial : styles.historyStatusOk),
                    }}
                  >
                    {entry.failedCount > 0 ? `部分失败 ${entry.successCount}/${entry.total}` : `✓ ${entry.total} 项`}
                  </span>
                </div>
                {entry.folders.length > 0 && (
                  <div style={styles.historyFolders}>
                    {entry.folders.map((f) => (
                      <span key={f} style={styles.historyFolder}>📁 {f}</span>
                    ))}
                  </div>
                )}
                {entry.failedFiles && entry.failedFiles.length > 0 && (
                  <div style={styles.historyFailed}>
                    {entry.failedFiles.slice(0, 3).map((f, i) => (
                      <div key={i} style={styles.historyFailedItem}>
                        <span style={styles.historyFailedName}>{f.filename}</span>
                        <span style={styles.historyFailedError}>{f.error}</span>
                      </div>
                    ))}
                    {entry.failedFiles.length > 3 && (
                      <div style={styles.historyFailedMore}>还有 {entry.failedFiles.length - 3} 项失败…</div>
                    )}
                    <button
                      className="mc-library-button"
                      style={styles.historyRetryBtn}
                      onClick={() => onRetry(entry.failedFiles!)}
                    >
                      重试失败项
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <div style={{ ...styles.dialogActions, padding: "12px 0 0", borderTop: `0.5px solid ${theme.hairline}` }}>
            <button
              className="mc-library-button"
              style={styles.dialogGhost}
              onClick={() => {
                if (window.confirm(`清空所有 ${history.length} 条导出历史?此操作不可撤销。`)) {
                  onClear()
                }
              }}
            >
              清空历史
            </button>
            <button className="mc-library-button" style={styles.dialogPrimary} onClick={onClose}>
              关闭
            </button>
          </div>
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
