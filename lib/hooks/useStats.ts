import { useMemo } from "react"
import type { MediaItem } from "../../types"
import type { EnrichedItem } from "./useEnrichedItems"

// 批3-3:从 library.tsx 抽出的看板/侧栏聚合 5 个 useMemo(authors / stats / sidebarCounts / collectionCounts / noteImageCounts)。
// 纯重构,逻辑逐字迁移。stats 依赖 authors(本 hook 内部)。
export function useStats(
  items: MediaItem[],
  enrichedItems: EnrichedItem[]
) {
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

  return { authors, stats, sidebarCounts, collectionCounts, noteImageCounts }
}
