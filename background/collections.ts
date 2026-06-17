import type { Collection, MediaItem } from "../types"
import { COLLECTIONS_KEY, STORAGE_KEY } from "../types"
import { enqueueWrite, getItems } from "./storage"

function getCollections(): Promise<Collection[]> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(COLLECTIONS_KEY, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve((result[COLLECTIONS_KEY] as Collection[]) || [])
    })
  })
}

function setCollections(collections: Collection[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [COLLECTIONS_KEY]: collections }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

function setItems(items: MediaItem[]): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: items }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      resolve()
    })
  })
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// M6 Task 5 前置:旧 collection 缺 sortOrder/pinned 时,按 createdAt 倒序 lazy 写回
// 写入走 enqueueWrite;只触发一次(全量检查 needsMigration),保证向后兼容
function migrateCollections(): Promise<void> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          if (!collections.length) {
            resolve()
            return
          }
          // 任一 collection 缺 sortOrder 即触发迁移
          const needsMigration = collections.some((c) => c.sortOrder === undefined)
          if (!needsMigration) {
            resolve()
            return
          }
          // 旧 collection 按 createdAt 倒序,缺的 sortOrder 从 0 开始递增
          // pinned 字段缺失补默认 false
          const sortedByCreated = [...collections].sort(
            (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)
          )
          const orderMap = new Map<string, number>()
          let nextOrder = 0
          for (const c of sortedByCreated) {
            if (c.sortOrder === undefined) {
              orderMap.set(c.id, nextOrder)
              nextOrder += 1
            }
          }
          const next = collections.map((c) => ({
            ...c,
            sortOrder: c.sortOrder ?? orderMap.get(c.id) ?? 0,
            pinned: c.pinned ?? false,
          }))
          setCollections(next)
            .then(() => resolve())
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

export function ensureCollectionsInitialized(): Promise<void> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      chrome.storage.local.get(COLLECTIONS_KEY, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (Array.isArray(result[COLLECTIONS_KEY])) {
          resolve()
          return
        }
        chrome.storage.local.set({ [COLLECTIONS_KEY]: [] }, () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve()
        })
      })
    })
  ).then(() => migrateCollections())
}

export function listCollections(): Promise<Collection[]> {
  return getCollections()
}

export function createCollection(name: string, color: string): Promise<{ success: boolean; collection?: Collection; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return Promise.resolve({ success: false, error: "名称不能为空" })

  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          if (collections.some((collection) => collection.name === trimmed)) {
            resolve({ success: false, error: "收藏夹已存在" })
            return
          }
          const now = new Date().toISOString()
          // M6 Task 5:新 collection 显式赋 sortOrder = max+1(放最后),pinned = false
          // 避免下次 migrateCollections 重复触发(虽然幂等,但避免无效写)
          const maxOrder = collections.reduce(
            (max, c) => Math.max(max, c.sortOrder ?? -1),
            -1
          )
          const collection: Collection = {
            id: generateId(),
            name: trimmed,
            color,
            createdAt: now,
            updatedAt: now,
            sortOrder: maxOrder + 1,
            pinned: false,
          }
          const next = [collection, ...collections]
          setCollections(next)
            .then(() => resolve({ success: true, collection }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

export function renameCollection(id: string, name: string): Promise<{ success: boolean; error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return Promise.resolve({ success: false, error: "名称不能为空" })

  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          const next = collections.map((collection) =>
            collection.id === id
              ? { ...collection, name: trimmed, updatedAt: new Date().toISOString() }
              : collection
          )
          setCollections(next)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

export function deleteCollection(id: string): Promise<{ success: boolean; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      Promise.all([getCollections(), getItems()])
        .then(([collections, items]) => {
          const nextCollections = collections.filter((collection) => collection.id !== id)
          const nextItems = items.map((item) => {
            if (!item.collectionIds?.length) return item
            const nextIds = item.collectionIds.filter((collectionId) => collectionId !== id)
            return nextIds.length === item.collectionIds.length
              ? item
              : { ...item, collectionIds: nextIds.length ? nextIds : undefined }
          })
          Promise.all([setCollections(nextCollections), setItems(nextItems)])
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

export function assignCollection(itemIds: string[], collectionId: string): Promise<{ success: boolean; error?: string }> {
  if (!itemIds.length) return Promise.resolve({ success: true })

  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems()
        .then((items) => {
          const idSet = new Set(itemIds)
          const nextItems = items.map((item) => {
            if (!idSet.has(item.id)) return item
            const collectionIds = new Set(item.collectionIds || [])
            collectionIds.add(collectionId)
            return { ...item, collectionIds: [...collectionIds] }
          })
          setItems(nextItems)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

export function unassignCollection(itemIds: string[], collectionId: string): Promise<{ success: boolean; error?: string }> {
  if (!itemIds.length) return Promise.resolve({ success: true })

  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getItems()
        .then((items) => {
          const idSet = new Set(itemIds)
          const nextItems = items.map((item) => {
            if (!idSet.has(item.id) || !item.collectionIds?.length) return item
            const nextIds = item.collectionIds.filter((id) => id !== collectionId)
            return nextIds.length ? { ...item, collectionIds: nextIds } : { ...item, collectionIds: undefined }
          })
          setItems(nextItems)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

// M6 Task 5:改颜色
export function updateCollectionColor(id: string, color: string): Promise<{ success: boolean; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          if (!collections.some((c) => c.id === id)) {
            resolve({ success: false, error: "收藏夹不存在" })
            return
          }
          const next = collections.map((c) =>
            c.id === id ? { ...c, color, updatedAt: new Date().toISOString() } : c
          )
          setCollections(next)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

// M6 Task 5:置顶/取消置顶
export function setCollectionPinned(id: string, pinned: boolean): Promise<{ success: boolean; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          if (!collections.some((c) => c.id === id)) {
            resolve({ success: false, error: "收藏夹不存在" })
            return
          }
          const next = collections.map((c) =>
            c.id === id ? { ...c, pinned, updatedAt: new Date().toISOString() } : c
          )
          setCollections(next)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

// M6 Task 5:重排(用户拖拽后调用)
export function reorderCollections(orderedIds: string[]): Promise<{ success: boolean; error?: string }> {
  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      getCollections()
        .then((collections) => {
          if (orderedIds.length !== collections.length) {
            resolve({ success: false, error: "排序列表与当前数量不一致" })
            return
          }
          const idSet = new Set(orderedIds)
          if (!collections.every((c) => idSet.has(c.id))) {
            resolve({ success: false, error: "排序列表包含未知 id" })
            return
          }
          const orderMap = new Map(orderedIds.map((id, i) => [id, i]))
          const next = collections.map((c) => ({ ...c, sortOrder: orderMap.get(c.id) ?? 0 }))
          setCollections(next)
            .then(() => resolve({ success: true }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}

// M6 Task 5:批量移动(从 fromCollectionId 移除,加入 toCollectionId)
export function moveCollectionItems(
  itemIds: string[],
  fromCollectionId: string,
  toCollectionId: string
): Promise<{ success: boolean; error?: string; movedCount?: number }> {
  if (!itemIds.length) return Promise.resolve({ success: true, movedCount: 0 })
  if (fromCollectionId === toCollectionId) {
    return Promise.resolve({ success: false, error: "源收藏夹与目标收藏夹相同" })
  }

  return enqueueWrite(() =>
    new Promise((resolve, reject) => {
      Promise.all([getCollections(), getItems()])
        .then(([collections, items]) => {
          if (!collections.some((c) => c.id === fromCollectionId)) {
            resolve({ success: false, error: "源收藏夹不存在" })
            return
          }
          if (!collections.some((c) => c.id === toCollectionId)) {
            resolve({ success: false, error: "目标收藏夹不存在" })
            return
          }
          const idSet = new Set(itemIds)
          let movedCount = 0
          const nextItems = items.map((item) => {
            if (!idSet.has(item.id) || !item.collectionIds?.length) return item
            if (!item.collectionIds.includes(fromCollectionId)) return item
            const nextIds = item.collectionIds.filter((id) => id !== fromCollectionId)
            nextIds.push(toCollectionId)
            movedCount += 1
            return { ...item, collectionIds: nextIds }
          })
          setItems(nextItems)
            .then(() => resolve({ success: true, movedCount }))
            .catch(reject)
        })
        .catch(reject)
    })
  )
}
