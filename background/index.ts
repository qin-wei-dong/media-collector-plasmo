// background/index.ts — 消息路由 + 安装初始化
import { type MediaItem, type MessageType, type MessagePayloads, STORAGE_KEY } from "../types"
import { getItems, saveItem, saveItems, clearItems, removeItems } from "./storage"
import { batchDownload } from "./download"
import { stateInjector } from "../lib/xhs-state-inject"

/** COLLECT_MEDIA 入参 */
type CollectPayload = MessagePayloads["COLLECT_MEDIA"]
/** COLLECT_NOTE_IMAGES 入参 */
type CollectNotePayload = MessagePayloads["COLLECT_NOTE_IMAGES"]

// ====== 工具函数（模块内共享） ======
// 从 manifest 动态获取扩展图标，避免硬编码 hash
function getIconUrl(): string {
  const icons = chrome.runtime.getManifest().icons as Record<string, string> | undefined
  if (!icons) return ""
  const key = icons["48"] ? "48" : Object.keys(icons)[0]
  return chrome.runtime.getURL(icons[key])
}

export function showNote(title: string, msg: string) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: getIconUrl(),
      title,
      message: msg,
    },
    () => void chrome.runtime.lastError
  )
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
console.log("[BG] service worker 启动")

chrome.runtime.onInstalled.addListener(() => {
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
        showNote("未检测到素材", "小红书：请点击笔记弹出浮层后，点击「采集素材」按钮；抖音：请将鼠标悬停在视频上")
      }
    })
  })
})

// ====== 消息处理 ======
chrome.runtime.onMessage.addListener((message: { type: MessageType; payload?: any }, _sender, sendResponse) => {
  switch (message.type) {
    case "COLLECT_MEDIA": {
      const payload = message.payload as CollectPayload
      collectAndNotify(payload, (result) => {
        sendResponse(result)
      })
      return true
    }

    case "COLLECT_NOTE_IMAGES": {
      const { noteId, images, title, sourceUrl, author } = message.payload as CollectNotePayload
      const newItems: MediaItem[] = images.map((img, i) => ({
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
        author: author || undefined,
        coverUrl: img.coverUrl || img.url, // 首图作为封面,缺省回退自身 url
      }))
      saveItems(newItems).then((result) => {
        if (result.success) {
          showNote("✅ 笔记采集完成", `已采集 ${images.length} 张图片`)
        }
        sendResponse(result)
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) })
      })
      return true
    }

    case "GET_ITEMS":
      getItems().then((items) => sendResponse({ success: true, items }))
      return true

    case "INJECT_MAIN_WORLD": {
      // content script 请求注入 MAIN world 拦截器(绕过页面 CSP)
      // _sender.tab 由浏览器提供,标识消息来源的 tab
      if (_sender.tab?.id != null) {
        chrome.scripting
          .executeScript({
            target: { tabId: _sender.tab.id, allFrames: false },
            world: "MAIN",
            func: stateInjector,
            injectImmediately: true,
          })
          .then((res) => {
            console.log("[BG] MAIN world 注入成功", res?.[0] ? "Y" : "empty")
            sendResponse({ success: true })
          })
          .catch((e) => sendResponse({ success: false, error: String(e) }))
      } else {
        sendResponse({ success: false, error: "no tab" })
      }
      return true
    }

    case "CLEAR_ITEMS":
      clearItems().then(() => sendResponse({ success: true }))
      return true

    case "REMOVE_ITEMS": {
      const ids = message.payload as string[]
      removeItems(ids).then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "BATCH_DOWNLOAD":
      batchDownload(message.payload as MessagePayloads["BATCH_DOWNLOAD"]).then((result) => sendResponse(result))
      return true

    default:
      sendResponse({ success: false, error: "未知消息类型" })
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
    author?: string
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
    author: mediaData.author,
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
