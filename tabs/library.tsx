import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Collection, DialogState, ExportHistoryEntry, MediaItem, MediaType, Platform } from "../types"
import { PLATFORM_LABELS } from "../types"
import { TIME_ORDER, type ThemeTokens } from "../lib/design-tokens"
import { makeStyles } from "../lib/library-styles"
import { ThemeProvider, useTheme } from "../lib/use-theme"
import { PreviewModal } from "../components/PreviewModal"
import { Icon, type IconName } from "../components/Icon"
import { LibraryToast, type Notice } from "../components/LibraryToast"
import { LibraryCell } from "../components/LibraryCell"
import { LibraryRow } from "../components/LibraryRow"
import { CollectionDialog } from "../components/CollectionDialog"
import { ExportHistoryModal } from "../components/ExportHistoryModal"
import { buildExportPath, summarizeExportFolders, type ExportContext } from "../lib/export-path"
import { useLibraryData } from "../lib/hooks/useLibraryData"
import { useSortedCollections } from "../lib/hooks/useSortedCollections"
import { useEnrichedItems, type EnrichedItem } from "../lib/hooks/useEnrichedItems"
import { useStats } from "../lib/hooks/useStats"

type Scope = "all" | "recent" | "uncategorized"
type ViewMode = "grid" | "list"

// M6 Task 2:渐进渲染配置
const INITIAL_RENDER_COUNT = 160
const RENDER_INCREMENT = 120

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

  const { items, collections, history, failedHistoryCount, setItems, setCollections, setHistory, loadItems, loadCollections, loadHistory } = useLibraryData()
  const { sortedCollections } = useSortedCollections(collections)
  const { enrichedItems } = useEnrichedItems(items)
  const { authors, stats, sidebarCounts, collectionCounts, noteImageCounts } = useStats(items, enrichedItems)
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
  // M6 Task 4:导出历史 modal
  const [showHistory, setShowHistory] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [batchDownloading, setBatchDownloading] = useState(false)
  // M6 Task 2:渐进渲染——只渲染前 N 项,滚动接近底部再追加
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)

  useEffect(() => {
    injectLibraryStyles(theme)
  }, [theme])

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

function LibraryWithTheme() {
  return (
    <ThemeProvider initial="dark">
      <LibraryPage />
    </ThemeProvider>
  )
}

export default LibraryWithTheme
