import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MediaItem, MediaType, Platform } from "../types"
import { PLATFORM_LABELS } from "../types"
import { getAvatarGradient, getTimeBucket, TIME_ORDER, type ThemeTokens } from "../lib/design-tokens"
import { ThemeProvider, useTheme } from "../lib/use-theme"
import { PreviewModal } from "../components/PreviewModal"

type Scope = "all" | "recent" | "uncategorized"
type ViewMode = "grid" | "list"
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
  const [search, setSearch] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [platformFilter, setPlatformFilter] = useState<Platform | "">("")
  const [typeFilter, setTypeFilter] = useState<MediaType | "">("")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [sortDesc, setSortDesc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [batchDownloading, setBatchDownloading] = useState(false)

  useEffect(() => {
    injectLibraryStyles(theme)
  }, [theme])

  const loadItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
      if (resp?.items) setItems(resp.items)
    })
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearch("")
        searchRef.current?.blur()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

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
      uncategorized: items.filter((item) => !item.author).length,
      xhs: items.filter((item) => item.platform === "xiaohongshu").length,
      douyin: items.filter((item) => item.platform === "douyin").length,
    }
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
      if (scope === "uncategorized" && item.author) return false
      if (platformFilter && item.platform !== platformFilter) return false
      if (typeFilter && item.type !== typeFilter) return false
      if (q) {
        const haystack = `${item.title || ""} ${item.author || ""}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [items, platformFilter, scope, search, typeFilter])

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
  const selectedCount = selectedIds.size

  const pageTitle = useMemo(() => {
    if (platformFilter) return PLATFORM_LABELS[platformFilter]
    if (scope === "recent") return "最近采集"
    if (scope === "uncategorized") return "未分类"
    return "全部素材"
  }, [platformFilter, scope])

  const previewSiblings = useMemo(() => {
    if (!previewItem) return []
    if (!previewItem.noteId) return [previewItem]
    return items.filter((item) => item.noteId === previewItem.noteId)
  }, [items, previewItem])

  const selectScope = (next: Scope) => {
    setScope(next)
    if (next !== "all") setPlatformFilter("")
  }

  const selectPlatform = (next: Platform) => {
    setScope("all")
    setPlatformFilter((current) => (current === next ? "" : next))
  }

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

  const buildFilename = (item: MediaItem) => {
    const ext = item.type === "video" ? "mp4" : "jpg"
    const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
    return item.groupIndex !== undefined
      ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
      : `${baseName}.${ext}`
  }

  const downloadItems = (targets: MediaItem[]) => {
    if (!targets.length) return
    setBatchDownloading(true)
    chrome.runtime.sendMessage(
      {
        type: "BATCH_DOWNLOAD",
        payload: targets.map((item) => ({
          url: item.url,
          filename: buildFilename(item),
          platform: item.platform,
        })),
      },
      (resp) => {
        setBatchDownloading(false)
        if (resp?.success) {
          setNotice({
            kind: "success",
            message: `已导出 ${targets.length} 项到 素材库/ 文件夹`,
          })
          clearSelection()
        } else {
          setNotice({
            kind: "error",
            message: resp?.errors?.[0] || "导出失败,请确保小红书或抖音页面可访问",
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

  const createCollection = () => {
    setNotice({ kind: "info", message: "收藏夹管理将在 M3 开放" })
  }

  const addToCollection = () => {
    setNotice({ kind: "info", message: "加入收藏夹将在 M3 开放" })
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
            active={scope === "all" && !platformFilter}
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
          onAction={createCollection}
        >
          {["618 选题", "穿搭对标", "美食探店", "口播脚本灵感"].map((name) => (
            <SidebarItem
              key={name}
              dot={getAvatarGradient(name)}
              label={name}
              count={0}
              onClick={() => setNotice({ kind: "info", message: "收藏夹筛选将在 M3 开放" })}
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
            <span style={styles.selectedText}>已选 <b>{selectedCount}</b> 项</span>
            <button className="mc-library-button" style={styles.bulkGhost} onClick={addToCollection} disabled={!selectedCount}>
              <Icon name="box" size={15} />
              加入收藏夹
            </button>
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
          {sortedItems.length === 0 ? (
            <div style={styles.emptyState}>没有匹配的素材</div>
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
  }: {
    icon?: IconName
    dot?: string
    label: string
    count?: number
    active?: boolean
    onClick?: () => void
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
  const cover = item.coverUrl || item.url
  const isVideo = item.type === "video"
  const showMultiBadge = !isVideo && imageCount && imageCount > 1
  const platformColor = item.platform === "xiaohongshu" ? theme.xhs : item.platform === "douyin" ? theme.douyin : theme.textTertiary

  return (
    <div
      className="mc-library-cell"
      style={{ ...styles.cell, ...(selected ? styles.cellSelected : {}) }}
      role="button"
      tabIndex={0}
      onClick={onPreview}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onPreview()
        }
      }}
      aria-label={`预览素材 ${item.title || "未命名素材"}`}
    >
      {!imgError && (
        <img
          src={cover}
          alt=""
          style={styles.cellImage}
          onError={() => setImgError(true)}
        />
      )}

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
  const cover = item.coverUrl || item.url
  return (
    <div style={{ ...styles.row, ...(selected ? styles.rowSelected : {}) }}>
      <button style={{ ...styles.rowCheck, ...(selected ? styles.checkActive : {}) }} onClick={onToggleSelect} aria-label={selected ? "取消选择该素材" : "选择该素材"}>
        {selected && <Icon name="check" size={13} />}
      </button>
      <button style={styles.rowThumbButton} onClick={onPreview}>
        <img src={cover} alt="" style={styles.rowThumb} />
      </button>
      <button style={styles.rowMeta} onClick={onPreview}>
        <span style={styles.rowTitle}>{item.title || "未命名素材"}</span>
        <span style={styles.rowSub}>{item.author || "未分类"} · {PLATFORM_LABELS[item.platform]} · {item.type === "video" ? "视频" : "图片"}</span>
      </button>
      <span style={styles.rowDate}>{new Date(item.collectedAt).toLocaleDateString("zh-CN")}</span>
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
  const card = "rgba(255,255,255,0.05)"
  const cardHover = "rgba(255,255,255,0.09)"
  const textTertiary = "rgba(255,255,255,0.42)"
  const green = "#30d158"

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
      fontWeight: 500,
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
      fontWeight: 500,
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
      gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
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
    cellImage: {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
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
      opacity: 0,
      transition: `all ${theme.durFast} ${theme.easeOut}`,
      display: "grid",
      placeItems: "center",
      color: "#fff",
      cursor: "pointer",
      padding: 0,
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
    emptyState: {
      height: "100%",
      minHeight: 260,
      display: "grid",
      placeItems: "center",
      color: textTertiary,
      fontSize: 14,
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
