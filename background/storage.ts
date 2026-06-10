// background/storage.ts — 存储 CRUD 操作
import { type MediaItem, STORAGE_KEY } from "../types"

export function getItems(): Promise<MediaItem[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as MediaItem[]) || [])
    })
  })
}

export function saveItem(item: MediaItem): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      if (items.some((existing) => existing.url === item.url)) {
        resolve({ success: false, error: "已存在" })
        return
      }
      items.unshift(item)
      chrome.storage.local.set({ [STORAGE_KEY]: items }, () => {
        resolve({ success: true })
      })
    })
  })
}

export function saveItems(newItems: MediaItem[]): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      const existingUrls = new Set(items.map((i) => i.url))
      const toAdd = newItems.filter((item) => !existingUrls.has(item.url))
      const merged = [...toAdd, ...items]
      chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
        resolve({ success: true })
      })
    })
  })
}

export function clearItems(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => resolve())
  })
}

export function removeItem(id: string): Promise<void> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      const filtered = items.filter((i) => i.id !== id)
      chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => resolve())
    })
  })
}
