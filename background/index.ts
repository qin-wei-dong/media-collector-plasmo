// background/index.ts — 消息路由 + 安装初始化
import { type MediaItem, STORAGE_KEY } from "../types"
import { getItems, saveItem, saveItems, clearItems } from "./storage"
import { downloadSingle, batchDownload } from "./download"

// ====== 工具函数（模块内共享） ======
export function showNote(title: string, msg: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title,
    message: msg,
  })
}

function getPlatform(url?: string): string {
  if (!url) return "unknown"
  if (url.includes("xiaohongshu.com")) return "xiaohongshu"
  if (url.includes("douyin.com")) return "douyin"
  return "unknown"
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ====== 安装 ======
chrome.runtime.onInstalled.addListener(() => {
  console.log("素材采集助手已安装")

  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (!result[STORAGE_KEY]) {
      chrome.storage.local.set({ [STORAGE_KEY]: [] })
    }
  })

  chrome.contextMenus.create({
    id: "collect_media",
    title: "📥 采集此素材",
    contexts: ["image", "video"],
  })
})

// ====== 右键菜单 ======
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "collect_media") return
  if (!info.srcUrl) return

  collectAndNotify({
    url: info.srcUrl,
    type: info.mediaType === "video" ? "video" : "image",
    platform: getPlatform(tab?.url),
    title: tab?.title || "",
    sourceUrl: tab?.url || "",
  })
})

// ====== 快捷键 ======
chrome.commands.onCommand.addListener((command) => {
  if (command !== "collect_media") return

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    chrome.tabs.sendMessage(tab.id, { type: "GET_LAST_MEDIA" }, (response) => {
      if (response?.media) {
        collectAndNotify(response.media)
      } else {
        showNote("未检测到素材", "请先将鼠标悬停在图片/视频上")
      }
    })
  })
})

// ====== 消息处理 ======
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "COLLECT_MEDIA":
      collectAndNotify(message.payload, (result) => sendResponse(result))
      return true

    case "COLLECT_NOTE_IMAGES": {
      const { noteId, images, title, sourceUrl } = message.payload
      const newItems: MediaItem[] = images.map((img: any, i: number) => ({
        id: generateId(),
        url: img.url,
        type: "image" as const,
        platform: "xiaohongshu" as const,
        title: title || "未命名笔记",
        sourceUrl,
        collectedAt: new Date().toISOString(),
        noteId,
        groupIndex: img.groupIndex ?? i,
        width: img.width,
        height: img.height,
      }))
      saveItems(newItems).then((result) => {
        if (result.success) {
          showNote("✅ 笔记采集完成", `已采集 ${images.length} 张图片`)
        }
        sendResponse(result)
      })
      return true
    }

    case "GET_ITEMS":
      getItems().then((items) => sendResponse({ success: true, items }))
      return true

    case "CLEAR_ITEMS":
      clearItems().then(() => sendResponse({ success: true }))
      return true

    case "DOWNLOAD_ITEM":
      downloadSingle(message.payload.url, message.payload.filename).then((result) =>
        sendResponse(result)
      )
      return true

    case "BATCH_DOWNLOAD":
      batchDownload(message.payload).then((result) => sendResponse(result))
      return true

    default:
      sendResponse({ success: false })
      return false
  }
})

// ====== 采集核心 ======
function collectAndNotify(
  mediaData: {
    url: string
    type: string
    platform: string
    title: string
    sourceUrl: string
    noteId?: string
    groupIndex?: number
    width?: number
    height?: number
  },
  callback?: (result: { success: boolean; error?: string; item?: MediaItem }) => void
) {
  const newItem: MediaItem = {
    id: generateId(),
    url: mediaData.url,
    type: (mediaData.type || "image") as "image" | "video",
    platform: (mediaData.platform || "unknown") as "xiaohongshu" | "douyin" | "unknown",
    title: (mediaData.title || "").slice(0, 200),
    sourceUrl: mediaData.sourceUrl || "",
    collectedAt: new Date().toISOString(),
    noteId: mediaData.noteId,
    groupIndex: mediaData.groupIndex,
    width: mediaData.width,
    height: mediaData.height,
  }

  saveItem(newItem).then((result) => {
    if (result.success) {
      showNote("✅ 采集成功", mediaData.title || "素材已添加")
    } else {
      showNote("已存在", "该素材已在采集列表中")
    }
    callback?.({ success: result.success, error: result.error, item: newItem })
  })
}
