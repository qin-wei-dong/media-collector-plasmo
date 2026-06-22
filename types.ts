// types.ts — 素材采集助手共享类型定义

export type MediaType = "image" | "video"
export type Platform = "xiaohongshu" | "unknown"

export interface Collection {
  id: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
  // M6 Task 5 字段:旧 collection 可能缺失,migrateCollections() 会按 createdAt 倒序 lazy 写回
  sortOrder?: number
  pinned?: boolean
}

// 收藏夹 dialog 状态 — LibraryPage + CollectionDialog 共用
export type DialogState =
  | { type: "create" }
  | { type: "assign" }
  | { type: "rename"; collection: Collection }
  | { type: "delete"; collection: Collection }
  | null

export interface MediaItem {
  id: string
  url: string
  type: MediaType
  platform: Platform
  title: string
  sourceUrl: string
  collectedAt: string

  // v2 新增
  originalUrl?: string
  coverUrl?: string
  author?: string
  duration?: number
  width?: number
  height?: number
  noteId?: string
  groupIndex?: number
  collectionIds?: string[]
  exportedAt?: string

  // UI 状态（不持久化）
  _selected?: boolean
}

export type MessageType =
  | "COLLECT_MEDIA"
  | "COLLECT_NOTE_IMAGES"
  | "GET_ITEMS"
  | "CLEAR_ITEMS"
  | "BATCH_DOWNLOAD"
  | "COLLECT_CURRENT_NOTE"
  | "INJECT_MAIN_WORLD"
  | "REMOVE_ITEMS"
  | "RESTORE_ITEMS"
  | "GET_COLLECTIONS"
  | "CREATE_COLLECTION"
  | "RENAME_COLLECTION"
  | "DELETE_COLLECTION"
  | "ASSIGN_COLLECTION"
  | "UNASSIGN_COLLECTION"
  | "UPDATE_COLLECTION_COLOR"
  | "REORDER_COLLECTIONS"
  | "PIN_COLLECTION"
  | "MOVE_COLLECTION_ITEMS"
  | "GET_EXPORT_HISTORY"
  | "CLEAR_EXPORT_HISTORY"
  | "RETRY_EXPORT_FAILED"
  | "SHOW_DOWNLOADS_FOLDER"

export interface MessagePayloads {
  COLLECT_MEDIA: {
    url: string
    type: MediaType
    platform: Platform
    title: string
    sourceUrl: string
    noteId?: string
    groupIndex?: number
    width?: number
    height?: number
    author?: string
    coverUrl?: string
  }
  COLLECT_NOTE_IMAGES: {
    noteId: string
    images: Array<{
      url: string
      width?: number
      height?: number
      groupIndex: number
      coverUrl?: string
    }>
    title: string
    sourceUrl: string
    author?: string
  }
  GET_ITEMS: void
  CLEAR_ITEMS: void
  BATCH_DOWNLOAD: Array<{ id?: string; url: string; filename: string; platform?: Platform }>
  COLLECT_CURRENT_NOTE: void
  REMOVE_ITEMS: string[]
  RESTORE_ITEMS: MediaItem[]
  GET_COLLECTIONS: void
  CREATE_COLLECTION: { name: string; color: string }
  RENAME_COLLECTION: { id: string; name: string }
  DELETE_COLLECTION: { id: string }
  ASSIGN_COLLECTION: { itemIds: string[]; collectionId: string }
  UNASSIGN_COLLECTION: { itemIds: string[]; collectionId: string }
  UPDATE_COLLECTION_COLOR: { id: string; color: string }
  REORDER_COLLECTIONS: { orderedIds: string[] }
  PIN_COLLECTION: { id: string; pinned: boolean }
  MOVE_COLLECTION_ITEMS: { itemIds: string[]; fromCollectionId: string; toCollectionId: string }
  GET_EXPORT_HISTORY: void
  CLEAR_EXPORT_HISTORY: void
  // 重试导出失败文件:files 是历史记录中的 failedFiles
  RETRY_EXPORT_FAILED: { files: Array<{ id?: string; url: string; filename: string; platform?: Platform }> }
  SHOW_DOWNLOADS_FOLDER: void
}

export interface MessageResponse {
  success: boolean
  error?: string
  items?: MediaItem[]
  item?: MediaItem
  downloadId?: number
  count?: number
  added?: number
  skipped?: number
  errors?: string[]
  folder?: string
  folders?: string[]
  exportedIds?: string[]
  collections?: Collection[]
  collection?: Collection
  // M6 Task 4:导出历史(GET_EXPORT_HISTORY 返回)
  history?: ExportHistoryEntry[]
  // COLLECT_CURRENT_NOTE:content script 是否已自主完成采集(快捷键路径),
  // background 据此决定是否显示兜底通知
  handled?: boolean
  ok?: boolean
}

// M6 Task 4:导出历史条目 — 记录每次 batchDownload 的结果
export interface ExportHistoryEntry {
  id: string
  createdAt: string
  total: number
  successCount: number
  failedCount: number
  folders: string[]
  itemIds: string[]
  failedFiles?: Array<{
    id?: string
    url: string
    filename: string
    platform?: Platform
    error: string
  }>
}

export const STORAGE_KEY = "collected_media"
export const COLLECTIONS_KEY = "collections"
export const EXPORT_HISTORY_KEY = "export_history"
export const EXPORT_HISTORY_MAX = 50
export const MEDIA_COLLECTOR_DIR = "media-collector"

export const PLATFORM_LABELS: Record<Platform, string> = {
  xiaohongshu: "小红书",
  unknown: "未知",
}
