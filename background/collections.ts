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
  )
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
          const collection: Collection = {
            id: generateId(),
            name: trimmed,
            color,
            createdAt: now,
            updatedAt: now,
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
