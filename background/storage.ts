// background/storage.ts — 存储 CRUD 操作
import { type ExportHistoryEntry, type MediaItem, EXPORT_HISTORY_KEY, EXPORT_HISTORY_MAX, STORAGE_KEY } from "../types"

// Write lock: serialize all write operations to prevent race conditions
let writeQueue: Promise<void> = Promise.resolve()

export function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const task = writeQueue.then(fn, fn)
  writeQueue = task.then(() => void 0, () => void 0)
  return task
}

export function getItems(): Promise<MediaItem[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve((result[STORAGE_KEY] as MediaItem[]) || [])
    })
  })
}

export function saveItem(item: MediaItem): Promise<{ success: boolean; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((items) => {
        if (items.some((existing) => existing.url === item.url)) {
          resolve({ success: false, error: "已存在" })
          return
        }
        items.unshift(item)
        chrome.storage.local.set({ [STORAGE_KEY]: items }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ success: true })
        })
      }).catch(reject)
    })
  )
}

export function saveItems(newItems: MediaItem[]): Promise<{ success: boolean; added: number; skipped: number; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((items) => {
        const existingUrls = new Set(items.map((i) => i.url))
        const toAdd = newItems.filter((item) => !existingUrls.has(item.url))
        const skipped = newItems.length - toAdd.length
        if (toAdd.length === 0) {
          resolve({ success: false, added: 0, skipped, error: "已存在" })
          return
        }
        const merged = [...toAdd, ...items]
        chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ success: true, added: toAdd.length, skipped })
        })
      }).catch(reject)
    })
  )
}

export function clearItems(): Promise<void> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve()
      })
    })
  )
}

export function removeItem(id: string): Promise<void> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((items) => {
        const filtered = items.filter((i) => i.id !== id)
        if (filtered.length === items.length) {
          resolve()
          return
        }
        chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      }).catch(reject)
    })
  )
}

export function removeItems(ids: string[]): Promise<void> {
  if (!ids.length) return Promise.resolve()
  const idSet = new Set(ids)
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((items) => {
        const filtered = items.filter((i) => !idSet.has(i.id))
        chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      }).catch(reject)
    })
  )
}

/**
 * 恢复一组已删除的素材(用于 Toast 撤销)。
 * - 按 id 去重,保留原始 id / collectedAt 等元数据
 * - 新恢复的项插入到列表最前(模拟"刚被删除又恢复"的时间顺序)
 */
export function restoreItems(items: MediaItem[]): Promise<{ success: boolean; restored: number }> {
  if (!items.length) return Promise.resolve({ success: true, restored: 0 })
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((existing) => {
        const existingIds = new Set(existing.map((i) => i.id))
        const toAdd = items.filter((item) => !existingIds.has(item.id))
        const merged = [...toAdd, ...existing]
        chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ success: true, restored: toAdd.length })
        })
      }).catch(reject)
    })
  )
}

/**
 * 标记一组素材已导出(M4:写入 exportedAt,供库页“本周已导出”看板聚合)。
 * - 只更新匹配 id 的 exportedAt,其余字段原样保留
 * - 不改变列表顺序
 * - 空数组直接返回,不写 storage
 */
export function markItemsExported(
  ids: string[],
  exportedAt: string
): Promise<{ success: boolean; updated: number }> {
  if (!ids.length) return Promise.resolve({ success: true, updated: 0 })
  const idSet = new Set(ids)
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems().then((items) => {
        let updated = 0
        const next = items.map((item) => {
          if (!idSet.has(item.id)) return item
          updated += 1
          return { ...item, exportedAt }
        })
        if (updated === 0) {
          resolve({ success: true, updated: 0 })
          return
        }
        chrome.storage.local.set({ [STORAGE_KEY]: next }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve({ success: true, updated })
        })
      }).catch(reject)
    })
  )
}

// ===== M6 Task 4:导出历史 =====

export function getExportHistory(): Promise<ExportHistoryEntry[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(EXPORT_HISTORY_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve((result[EXPORT_HISTORY_KEY] as ExportHistoryEntry[]) || [])
    })
  })
}

export function appendExportHistory(entry: ExportHistoryEntry): Promise<{ success: boolean }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getExportHistory()
        .then((history) => {
          // 新的 unshift,保留最近 N 条
          const next = [entry, ...history].slice(0, EXPORT_HISTORY_MAX)
          chrome.storage.local.set({ [EXPORT_HISTORY_KEY]: next }, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
              return
            }
            resolve({ success: true })
          })
        })
        .catch(reject)
    })
  )
}

export function clearExportHistory(): Promise<{ success: boolean }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      chrome.storage.local.set({ [EXPORT_HISTORY_KEY]: [] }, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        resolve({ success: true })
      })
    })
  )
}
