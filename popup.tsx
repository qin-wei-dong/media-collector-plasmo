// popup.tsx — 素材采集助手弹窗(Apple Music 沉浸风)
import { useState, useEffect, useCallback, useMemo } from "react"
import type { MediaItem } from "./types"
import { getTimeBucket, TIME_ORDER } from "./lib/design-tokens"
import { ThemeProvider, useTheme, useThemeControl } from "./lib/use-theme"
import type { ThemeTokens } from "./lib/design-tokens"
import { FloatBar } from "./components/FloatBar"
import { EmptyState } from "./components/EmptyState"
import { MediaCard } from "./components/MediaCard"
import { PreviewModal } from "./components/PreviewModal"
import { Toast } from "./components/Toast"
import { StatCard } from "./components/StatCard"

// 注入全局样式:覆盖 Plasmo 默认 body 白底/margin,让 popup 整体深色透明
// 接受 theme 参数:P3-21 加 light 主题时,theme 变了会重新注入 focus ring / 颜色
function injectPopupStyles(theme: import("./lib/design-tokens").ThemeTokens) {
  const id = "__mc_popup_style"
  let el = document.getElementById(id) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement("style")
    el.id = id
    document.head.appendChild(el)
  }
  el.textContent = `
    html, body { margin:0; padding:0; background:transparent; width:460px; height:100%; overflow:hidden; }
    #__plasmo { height:100%; overflow:hidden; background:transparent; border-radius:20px; }
    @keyframes mc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes mc-toast-in { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    /* P0-5: 全局 focus-visible,让键盘用户能看到焦点位置 */
    :focus { outline: none; }
    :focus-visible {
      outline: 2px solid ${theme.accent};
      outline-offset: 2px;
      border-radius: ${theme.r.sm}px;
    }
    button:focus-visible, [role="button"]:focus-visible {
      box-shadow: 0 0 0 2px ${theme.accent}, 0 0 0 4px rgba(10,132,255,0.3);
      outline: none;
    }
    /* P2-2: MediaCard hover/press 反馈 */
    .mc-card-art {
      transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1),
                  box-shadow 180ms cubic-bezier(0.16, 1, 0.3, 1);
    }
    .mc-card-art:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 12px 28px rgba(0,0,0,0.55); }
    .mc-card-art:active { transform: scale(0.95); }
    /* hover 时浮现卡片底部信息层(作者) */
    .mc-card-art:hover .mc-card-info { opacity: 1; }
  `
}

function Popup() {
  const theme = useTheme()
  const styles = makeStyles(theme)
  const { mode: themeMode, cycleMode } = useThemeControl()
  const [items, setItems] = useState<MediaItem[]>([])
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [authorFilter, setAuthorFilter] = useState("")
  const [platformFilter, setPlatformFilter] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  // P0-4: Toast 撤销 - 暂存刚删除的素材,5 秒内可点撤销
  const [deletedBackup, setDeletedBackup] = useState<MediaItem[] | null>(null)
  const [undoToastVisible, setUndoToastVisible] = useState(false)

  // 注入全局样式(覆盖 Plasmo 默认白底);主题切换时重新注入
  useEffect(() => {
    injectPopupStyles(theme)
  }, [theme])

  // P2-5: 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 忽略输入框内的快捷键
      const tag = (e.target as HTMLElement)?.tagName
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable

      // Cmd/Ctrl + K → 切换搜索
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setSearchOpen((s) => !s)
        setSearchQuery("")
        return
      }

      // / → 打开搜索(仅非输入态)
      if (e.key === "/" && !isTyping && !searchOpen) {
        e.preventDefault()
        setSearchOpen(true)
        return
      }

      // Escape → 关闭搜索或预览
      if (e.key === "Escape") {
        if (searchOpen) {
          e.preventDefault()
          setSearchOpen(false)
          setSearchQuery("")
        }
        // PreviewModal 内部已自行处理 Escape
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [searchOpen])

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
      const err = chrome.runtime.lastError
      if (err || !resp) {
        // SW 休眠/重启:lastError 非空或 resp undefined,重试 1 次
        console.warn("[Popup] GET_ITEMS 失败,重试:", err?.message)
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

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // ===== 数据聚合 =====

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

  // 数据看板聚合(§3.4):今日采集数 / 图视分布 / 作者数。纯前端,基于已有 items。
  const stats = useMemo(() => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    let today = 0, imgCount = 0, videoCount = 0
    for (const it of items) {
      if (new Date(it.collectedAt).getTime() >= todayStart) today++
      if (it.type === "video") videoCount++; else imgCount++
    }
    const authorCount = authors.filter((a) => a.name).length // 排除"未分类"空作者
    return { today, total: items.length, imgCount, videoCount, authorCount }
  }, [items, authors])

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
          id: i.id,
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

  // M2: 打开全屏素材库页
  const openLibrary = () => {
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL("tabs/library.html") })
    } catch {
      setDownloadError("无法打开素材库,请稍后重试")
    }
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

  // 删除:备份当前选中的素材 → 发送 REMOVE_ITEMS → 显示 Toast 撤销入口
  const removeSelected = () => {
    const selectedItems = items.filter((i) => i._selected)
    if (!selectedItems.length) return
    const ids = selectedItems.map((i) => i.id)

    // 先备份,Toast 撤销时使用
    setDeletedBackup(selectedItems.map(({ _selected, ...rest }) => rest))
    setUndoToastVisible(true)

    chrome.runtime.sendMessage({ type: "REMOVE_ITEMS", payload: ids }, () => {
      if (chrome.runtime.lastError) {
        console.error("[Popup] 删除失败", chrome.runtime.lastError)
        // 删除失败:回滚 toast
        setUndoToastVisible(false)
        setDeletedBackup(null)
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

  // 撤销删除:发送 RESTORE_ITEMS,background 把素材插回原位
  const undoDelete = () => {
    if (!deletedBackup || !deletedBackup.length) return
    const itemsToRestore = deletedBackup
    setDeletedBackup(null)
    chrome.runtime.sendMessage(
      { type: "RESTORE_ITEMS", payload: itemsToRestore },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("[Popup] 撤销失败", chrome.runtime.lastError)
          return
        }
        // 重新拉取最新数据
        chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (r) => {
          if (r?.items) setItems(r.items)
        })
      }
    )
  }

  if (items.length === 0) {
    return (
      <div style={styles.root}>
        <div style={styles.ambient} />
        <div style={styles.content}>
          <div style={styles.navbar}>
            <span style={styles.largetitle}>素材库</span>
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
          <div style={styles.brand}>
            {/* P2-1: 品牌 logo(双层叠片,代表"素材集合") */}
            <svg
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              aria-hidden="true"
              style={styles.logo}
            >
              <defs>
                <linearGradient id="mc-logo-grad" x1="0" y1="0" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#5AC8FA" />
                  <stop offset="100%" stopColor="#0a84ff" />
                </linearGradient>
              </defs>
              <rect x="3" y="9" width="13" height="10" rx="2.5" fill="url(#mc-logo-grad)" opacity="0.55" />
              <rect x="6" y="3" width="13" height="10" rx="2.5" fill="url(#mc-logo-grad)" />
            </svg>
            <span style={styles.largetitle}>素材库</span>
            <span style={styles.countBadge} aria-label={`共 ${items.length} 项素材`}>{items.length}</span>
          </div>
          <div style={styles.tools}>
            {/* 打开全屏素材库(独立 tab 页,左栏导航 + 批量操作 + 收藏夹) */}
            <div
              style={styles.tool}
              role="button"
              tabIndex={0}
              aria-label="打开素材库"
              title="打开素材库"
              onClick={openLibrary}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  openLibrary()
                }
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M15 3h6v6M21 3l-9 9" />
                <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
            </div>
            {/* P3-21: 主题切换(auto / dark / light 三态循环) */}
            <div
              style={styles.tool}
              role="button"
              tabIndex={0}
              aria-label={`主题: ${themeMode},点击切换`}
              title={`主题: ${themeMode === "auto" ? "跟随系统" : themeMode === "dark" ? "深色" : "浅色"} (点击切换)`}
              onClick={cycleMode}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  cycleMode()
                }
              }}
            >
              {themeMode === "dark" && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {themeMode === "light" && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                </svg>
              )}
              {themeMode === "auto" && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              )}
            </div>
            <div
              style={{ ...styles.tool, ...(searchOpen ? styles.toolActive : {}) }}
              title="搜索 (Cmd+K)"
              role="button"
              tabIndex={0}
              aria-label={searchOpen ? "关闭搜索" : "打开搜索"}
              aria-pressed={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen)
                setSearchQuery("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setSearchOpen(!searchOpen)
                  setSearchQuery("")
                }
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </div>
          </div>
        </div>

        {/* 数据看板(§3.4):非搜索态显示;搜索时收起聚焦结果 */}
        {!searchOpen && (
          <div style={styles.statsRow}>
            <StatCard value={String(stats.today)} unit="项" label="今日采集" highlight={stats.today > 0} />
            <StatCard value={String(stats.total)} unit="项" label="素材总量" hint={`图 ${stats.imgCount} · 视频 ${stats.videoCount}`} />
            <StatCard value={String(stats.authorCount)} unit="位" label="关注作者" />
          </div>
        )}

        {/* 搜索框 */}
        {searchOpen && (
          <div style={styles.searchWrap}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={styles.searchIcon} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              style={styles.searchInput}
              placeholder="搜索标题或作者"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              aria-label="搜索素材"
              role="searchbox"
            />
            {searchQuery && (
              <div
                style={styles.searchClear}
                role="button"
                tabIndex={0}
                aria-label="清除搜索"
                onClick={() => setSearchQuery("")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSearchQuery("")
                  }
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
            )}
          </div>
        )}

        {/* P1-2: 搜索激活时折叠筛选区,聚焦搜索结果 */}
        {!searchOpen && (
          <>
            {/* 筛选标签:平台 + 类型(图标式 segmented control,避免"全部"重复) */}
            <div style={styles.filterRow}>
              {/* 平台 chip - 激活态用对应平台品牌色 */}
              {[
                { key: "", label: "全部", color: theme.accent, bg: theme.accent + "29" },
                { key: "xiaohongshu", label: "小红书", color: theme.xhs, bg: theme.xhsBg },
                { key: "douyin", label: "抖音", color: theme.douyin, bg: theme.douyinBg },
              ].map((f) => {
                const isActive = platformFilter === f.key
                return (
                  <button
                    key={f.key}
                    style={{
                      ...styles.filterBtn,
                      ...(isActive
                        ? {
                            background: f.bg,
                            color: f.color,
                            fontWeight: 600,
                            borderColor: f.color + "55",
                          }
                        : {}),
                    }}
                    onClick={() => setPlatformFilter(platformFilter === f.key ? "" : f.key)}
                    aria-pressed={isActive}
                  >
                    {f.label}
                  </button>
                )
              })}
              <div style={styles.filterDivider} />
              {/* 类型 segmented control:点击同一项取消选中(回到"全部") */}
              <div style={styles.typeSegment} role="group" aria-label="按类型筛选">
                <button
                  style={{
                    ...styles.typeBtn,
                    ...(typeFilter === "image" ? styles.typeBtnActive : {}),
                  }}
                  onClick={() => setTypeFilter(typeFilter === "image" ? "" : "image")}
                  aria-label="只看图片"
                  aria-pressed={typeFilter === "image"}
                  title="图片"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <circle cx="9" cy="9" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                </button>
                <button
                  style={{
                    ...styles.typeBtn,
                    ...(typeFilter === "video" ? styles.typeBtnActive : {}),
                  }}
                  onClick={() => setTypeFilter(typeFilter === "video" ? "" : "video")}
                  aria-label="只看视频"
                  aria-pressed={typeFilter === "video"}
                  title="视频"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <polygon points="6 4 20 12 6 20" />
                  </svg>
                </button>
              </div>
            </div>

            {/* 作者筛选指示器 */}
            {authorFilter && (
              <div style={styles.filterChip}>
                <span style={styles.filterChipText}>作者: {authorFilter || "未分类"}</span>
                <div
                  style={styles.filterChipClear}
                  role="button"
                  tabIndex={0}
                  aria-label="清除作者筛选"
                  onClick={() => setAuthorFilter("")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      setAuthorFilter("")
                    }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </div>
              </div>
            )}
          </>
        )}

        {/* 滚动区:密集网格(对齐原型——无 Hero、无作者轮播) */}
        <div style={styles.scrollArea}>
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

        {/* P0-4: 删除撤销 Toast(底部 snackbar,5 秒内可点撤销) */}
        {undoToastVisible && deletedBackup && (
          <Toast
            message={`已删除 ${deletedBackup.length} 项`}
            actionLabel="撤销"
            onAction={undoDelete}
            duration={5000}
            onDismiss={() => {
              setUndoToastVisible(false)
              setDeletedBackup(null)
            }}
          />
        )}

        {/* 下载错误提示 */}
        {downloadError && (
          <Toast
            message={downloadError}
            duration={4000}
            onDismiss={() => setDownloadError("")}
          />
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

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
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
  // 氛围色背景(P3-21:从主题取,自动适配 dark / light)
  ambient: {
    position: "absolute",
    inset: 0,
    zIndex: 0,
    background: theme.ambient,
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
    padding: `14px ${theme.sp.md}px ${theme.sp.sm - 2}px`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: theme.sp.xs + 2, // 10px
  },
  logo: {
    flexShrink: 0,
    filter: "drop-shadow(0 2px 6px rgba(10,132,255,0.35))",
  },
  largetitle: {
    fontSize: theme.fs.display,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  countBadge: {
    fontSize: theme.fs.micro,
    fontWeight: 600,
    color: theme.textSecondary,
    background: theme.card,
    padding: "2px 8px",
    borderRadius: theme.r.sm,
    marginLeft: 6,
    verticalAlign: "middle",
  },
  tools: { display: "flex", gap: 6 },
  statsRow: {
    display: "flex",
    gap: theme.sp.xs,
    padding: `0 ${theme.sp.md}px ${theme.sp.sm}px`,
  },
  tool: {
    width: theme.btn.sm,
    height: theme.btn.sm,
    borderRadius: theme.r.pill,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: theme.textSecondary,
    background: theme.card,
    backdropFilter: theme.glassBlur,
    WebkitBackdropFilter: theme.glassBlur,
    transition: `all ${theme.durFast} ${theme.easeOut}`,
  },
  gridSection: { padding: `0 ${theme.sp.md}px ${theme.sp.sm + 2}px` },
  gridHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingBottom: theme.sp.xs,
  },
  gridTitle: { fontSize: theme.fs.title, fontWeight: 700, letterSpacing: "-0.3px", color: theme.textPrimary },
  gridCount: { fontSize: theme.fs.caption, color: theme.textTertiary, fontWeight: 500 },
  gridWrap: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: theme.sp.xs + 2, // 10px,密集但不拥挤
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
    color: "#fff",
  },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: theme.sp.xs,
    margin: `0 ${theme.sp.md}px ${theme.sp.sm - 2}px`,
    padding: `7px ${theme.sp.sm}px`,
    background: theme.card,
    borderRadius: theme.r.sm,
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
    fontSize: theme.fs.bodyLg,
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
    margin: `0 ${theme.sp.md}px ${theme.sp.xs}px`,
    flexWrap: "wrap",
  },
  filterBtn: {
    border: "1px solid transparent",
    background: theme.card,
    color: theme.textSecondary,
    fontSize: theme.fs.micro + 2, // 13px,提升可读性
    fontWeight: 600, // M5 Task 5:按钮类用 600(plan 规则)
    padding: "5px 12px",
    borderRadius: theme.r.pill, // 对齐原型:胶囊 chip
    cursor: "pointer",
    transition: `all ${theme.durFast} ${theme.easeOut}`,
    fontFamily: "inherit",
  },
  filterBtnActive: {
    background: theme.accent,
    color: "#fff",
    fontWeight: 600,
    borderColor: theme.accent,
  },
  filterDivider: {
    width: 1,
    height: 16,
    background: theme.hairline,
    margin: "0 2px",
  },
  // 类型 segmented control(图标)
  typeSegment: {
    display: "inline-flex",
    background: theme.card,
    borderRadius: theme.r.pill,
    padding: 2,
    gap: 2,
  },
  typeBtn: {
    width: 28,
    height: 22,
    border: "none",
    background: "transparent",
    color: theme.textSecondary,
    cursor: "pointer",
    borderRadius: theme.r.pill,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: `all ${theme.durFast} ${theme.easeOut}`,
  },
  typeBtnActive: {
    background: theme.accent,
    color: "#fff",
  },
  filterChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: theme.sp.xs,
    margin: `0 20px ${theme.sp.xs}px`,
    padding: `6px ${theme.sp.sm}px`,
    background: "rgba(255,255,255,0.12)",
    borderRadius: theme.r.lg,
    fontSize: theme.fs.caption,
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
})

export default function PopupWithTheme() {
  return (
    <ThemeProvider initial="dark">
      <Popup />
    </ThemeProvider>
  )
}
