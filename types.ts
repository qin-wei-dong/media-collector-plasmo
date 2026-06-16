// types.ts — 素材采集助手共享类型定义

export type MediaType = "image" | "video"
export type Platform = "xiaohongshu" | "douyin" | "unknown"

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

  // UI 状态（不持久化）
  _selected?: boolean
}

export type MessageType =
  | "COLLECT_MEDIA"
  | "COLLECT_NOTE_IMAGES"
  | "GET_ITEMS"
  | "CLEAR_ITEMS"
  | "BATCH_DOWNLOAD"
  | "GET_LAST_MEDIA"
  | "INJECT_MAIN_WORLD"
  | "REMOVE_ITEMS"
  | "RESTORE_ITEMS"

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
  BATCH_DOWNLOAD: Array<{ url: string; filename: string; platform?: Platform }>
  GET_LAST_MEDIA: void
  REMOVE_ITEMS: string[]
  RESTORE_ITEMS: MediaItem[]
}

export interface MessageResponse {
  success: boolean
  error?: string
  items?: MediaItem[]
  item?: MediaItem
  downloadId?: number
  count?: number
  errors?: string[]
  media?: {
    url: string
    type: MediaType
    platform: Platform
    title: string
    sourceUrl: string
  } | null
}

export const STORAGE_KEY = "collected_media"
export const MEDIA_COLLECTOR_DIR = "media-collector"

export const PLATFORM_LABELS: Record<Platform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知",
}
