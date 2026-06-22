import { useMemo } from "react"
import type { Collection } from "../../types"

/**
 * 收藏夹排序 hook:置顶优先 → sortOrder → 创建时间倒序。
 *
 * 纯迁自 LibraryPage(`tabs/library.tsx`)的 sortedCollections useMemo,零行为改动。
 */
export function useSortedCollections(collections: Collection[]) {
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

  return { sortedCollections }
}
