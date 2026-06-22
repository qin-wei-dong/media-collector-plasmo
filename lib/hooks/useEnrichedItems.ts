import { useMemo } from "react"
import type { MediaItem } from "../../types"
import { getTimeBucket } from "../design-tokens"

// M6 Task 3:预计算字段 — items 一次性派生,下游 useMemo 复用,避免重复 new Date()/字符串拼
// 内部计算字段以下划线开头,不入 storage(纯内存对象,源自 useMemo)
export type EnrichedItem = MediaItem & {
  _collectedAtMs: number
  _timeBucket: string
  _searchHaystack: string
}

export function useEnrichedItems(items: MediaItem[]) {
  // M6 Task 3:预计算 — items 变化时一次性算出 collectedAtMs / timeBucket / searchHaystack
  // 下游 useMemo(stats / authors / filteredItems / sortedItems / buckets / visibleBuckets)复用,避免重复 new Date()
  const enrichedItems = useMemo<EnrichedItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        _collectedAtMs: +new Date(item.collectedAt),
        _timeBucket: getTimeBucket(item.collectedAt),
        _searchHaystack: `${item.title || ""} ${item.author || ""}`.toLowerCase(),
      })),
    [items]
  )
  return { enrichedItems }
}
