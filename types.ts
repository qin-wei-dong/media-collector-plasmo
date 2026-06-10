// types.ts — 素材采集助手共享类型定义

export interface MediaItem {
  id: string
  url: string
  type: "image" | "video"
  platform: "xiaohongshu" | "douyin" | "unknown"
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
  | "DOWNLOAD_ITEM"
  | "BATCH_DOWNLOAD"
  | "GET_LAST_MEDIA"

export interface MessagePayloads {
  COLLECT_MEDIA: {
    url: string
    type: string
    platform: string
    title: string
    sourceUrl: string
    noteId?: string
    groupIndex?: number
    width?: number
    height?: number
  }
  COLLECT_NOTE_IMAGES: {
    noteId: string
    images: Array<{
      url: string
      width?: number
      height?: number
      groupIndex: number
    }>
    title: string
    sourceUrl: string
  }
  GET_ITEMS: void
  CLEAR_ITEMS: void
  DOWNLOAD_ITEM: { url: string; filename: string }
  BATCH_DOWNLOAD: Array<{ url: string; filename: string }>
  GET_LAST_MEDIA: void
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
    type: string
    platform: string
    title: string
    sourceUrl: string
  } | null
}

export const STORAGE_KEY = "collected_media"

export const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知",
}
