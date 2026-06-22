import { useCallback, useEffect, useMemo, useState } from "react"
import type { Collection, ExportHistoryEntry, MediaItem } from "../../types"

/**
 * 素材库数据层 hook:items / collections / history 三个 state + loadXxx + failedHistoryCount。
 *
 * 纯迁自 LibraryPage(`tabs/library.tsx`),零行为改动:
 *  - 三个 useState + loadItems / loadCollections / loadHistory(SW 休眠重试逻辑完整迁移)
 *  - 初始化 useEffect
 *  - failedHistoryCount useMemo
 *
 * setItems / setCollections 被 LibraryPage 业务 handler(撤销删除、收藏夹 CRUD 等)用,
 * setHistory 被 ExportHistoryModal 的 onClear 用,因此全部 return。
 */
export function useLibraryData() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [history, setHistory] = useState<ExportHistoryEntry[]>([])

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

  // 历史有失败项的总和(用于按钮角标)
  const failedHistoryCount = useMemo(
    () => history.reduce((sum, h) => sum + (h.failedCount || 0), 0),
    [history]
  )

  return {
    items,
    collections,
    history,
    failedHistoryCount,
    setItems,
    setCollections,
    setHistory,
    loadItems,
    loadCollections,
    loadHistory
  }
}
