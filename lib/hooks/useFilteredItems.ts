import { useEffect, useMemo, useState } from "react"
import type { EnrichedItem } from "./useEnrichedItems"

export type Scope = "all" | "recent" | "uncategorized"

export interface FilterState {
  search: string
  scope: Scope
  collectionFilter: string
  platformFilter: string
  typeFilter: string
}

// M6 Task 2:渐进渲染配置
const INITIAL_RENDER_COUNT = 160
const RENDER_INCREMENT = 120

export function useFilteredItems(
  enrichedItems: EnrichedItem[],
  filters: FilterState,
  sortDesc: boolean
) {
  const { search, scope, collectionFilter, platformFilter, typeFilter } = filters

  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)

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

  // 筛选/搜索/排序变化时重置 renderLimit
  // 注:viewMode 不入此 hook(视图态不影响 items 数量,渐进渲染无需重置)
  useEffect(() => {
    setRenderLimit(INITIAL_RENDER_COUNT)
  }, [search, scope, collectionFilter, platformFilter, typeFilter, sortDesc])

  const loadMore = useMemo(
    () => () => setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length)),
    [sortedItems.length]
  )

  return { filteredItems, sortedItems, buckets, visibleItems, visibleBuckets, renderLimit, loadMore }
}
