import { useCallback, useEffect, useMemo, useState } from "react"
import type { MediaItem } from "../../types"
import type { EnrichedItem } from "./useEnrichedItems"

export interface SelectionFilters {
  scope: string
  platformFilter: string
  collectionFilter: string
  typeFilter: string
  search: string
}

// 选择层:selectedIds state + 派生(selectedItems/selectedCount/allCurrentSelected)
// + handler(toggleItem/toggleSelectAll/clearSelection) + 两个清理 useEffect。
// toggleSelectAll / allCurrentSelected 用 sortedItems(来自 useFilteredItems)。
export function useSelection(
  items: MediaItem[],
  sortedItems: EnrichedItem[],
  filters: SelectionFilters
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 切换任何筛选(范围/平台/收藏夹/类型/搜索)时清空选中:
  // selectedItems 基于全量 items,不清空则被隐藏的素材仍会随导出带出、"已选 N 项"也会失真。
  // 已空时返回同引用,React bail out,避免 search 每次击键触发 re-render。
  useEffect(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [filters.scope, filters.platformFilter, filters.collectionFilter, filters.typeFilter, filters.search])

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

  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds])
  // selectedCount 取 selectedItems.length 而非 selectedIds.size,避免 items 变化时短暂失真
  // (selectedIds 已被 useEffect 清理过,但语义上"已选 N 项"必须等于"实际能批量操作的数量")
  const selectedCount = selectedItems.length
  const allCurrentSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.has(item.id))

  const toggleItem = useCallback((item: MediaItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const ids = sortedItems.map((item) => item.id)
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id))
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }, [sortedItems])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  return { selectedIds, selectedItems, selectedCount, allCurrentSelected, toggleItem, toggleSelectAll, clearSelection }
}
