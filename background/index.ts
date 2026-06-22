// background/index.ts — 消息路由 + 安装初始化
import { type MediaItem, type MessageType, type MessagePayloads, STORAGE_KEY } from "../types"
import { getItems, saveItem, saveItems, clearItems, removeItems, restoreItems, getExportHistory, clearExportHistory } from "./storage"
import {
  assignCollection,
  createCollection,
  deleteCollection,
  ensureCollectionsInitialized,
  listCollections,
  moveCollectionItems,
  reorderCollections,
  renameCollection,
  setCollectionPinned,
  unassignCollection,
  updateCollectionColor,
} from "./collections"
import { batchDownload } from "./download"
import { stateInjector } from "../lib/xhs-state-inject"
import { showNote } from "./notifications"

/** COLLECT_MEDIA 入参 */
type CollectPayload = MessagePayloads["COLLECT_MEDIA"]
/** COLLECT_NOTE_IMAGES 入参 */
type CollectNotePayload = MessagePayloads["COLLECT_NOTE_IMAGES"]

function getPlatform(url?: string): string {
  if (!url) return "unknown"
  if (url.includes("xiaohongshu.com")) return "xiaohongshu"
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
  ensureCollectionsInitialized().catch((err) => {
    console.error("[BG] 初始化收藏夹失败", err)
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

// ====== Action 点击 → 打开 library 全屏 tab ======
// v2.1.0 起删 popup 弹窗(M6 后 popup 是 library 的严格子集,冗余),点击图标直接打开工作台
chrome.action.onClicked.addListener(() => {
  const libraryUrl = chrome.runtime.getURL("tabs/library.html")
  chrome.tabs.query({ url: libraryUrl }, (tabs) => {
    if (tabs[0]?.id) {
      // 已开 library tab → 聚焦
      chrome.tabs.update(tabs[0].id, { active: true })
    } else {
      // 未开 → 新建
      chrome.tabs.create({ url: libraryUrl })
    }
  })
})

// ====== 快捷键 ======
chrome.commands.onCommand.addListener((command) => {
  if (command !== "collect_media") return

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    // 快捷键采集:content script(xiaohongshu.ts)收到 COLLECT_CURRENT_NOTE 后自主采集
    // 当前浮层/详情页(发 COLLECT_* 存储 + toast 反馈)。仅当 content 未处理时
    // (非 XHS 页 / 无浮层 / 扩展重载后页面没刷新)显示兜底提示。
    chrome.tabs.sendMessage(tab.id, { type: "COLLECT_CURRENT_NOTE" }, (response) => {
      if (chrome.runtime.lastError || !response?.handled) {
        showNote("未检测到素材", "请在小红书中点开笔记浮层后，再按快捷键或点击「采集素材」按钮")
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
        coverUrl: img.coverUrl || img.url,
      }))
      saveItems(newItems).then((result) => {
        if (result.success) {
          const suffix = result.skipped > 0 ? `，${result.skipped} 张已存在` : ""
          showNote("✅ 笔记采集完成", `新增 ${result.added} 张图片${suffix}`)
        } else if (result.error === "已存在") {
          showNote("已存在", "该笔记素材已在素材库中")
        }
        sendResponse(result)
      }).catch((err) => {
        sendResponse({ success: false, error: String(err) })
      })
      return true
    }

    case "GET_ITEMS":
      getItems()
        .then((items) => sendResponse({ success: true, items }))
        .catch((e) => sendResponse({ success: false, error: String(e), items: [] }))
      return true

    case "GET_COLLECTIONS":
      listCollections()
        .then((collections) => sendResponse({ success: true, collections }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
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
      clearItems()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true

    case "REMOVE_ITEMS": {
      const ids = message.payload as string[]
      removeItems(ids).then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "RESTORE_ITEMS": {
      // Toast 撤销:把刚删除的素材插回列表(按 id 去重,保留原始 id/时间戳)
      const items = message.payload as MediaItem[]
      restoreItems(items).then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "CREATE_COLLECTION": {
      const payload = message.payload as MessagePayloads["CREATE_COLLECTION"]
      createCollection(payload.name, payload.color)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "RENAME_COLLECTION": {
      const payload = message.payload as MessagePayloads["RENAME_COLLECTION"]
      renameCollection(payload.id, payload.name)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "DELETE_COLLECTION": {
      const payload = message.payload as MessagePayloads["DELETE_COLLECTION"]
      deleteCollection(payload.id)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "ASSIGN_COLLECTION": {
      const payload = message.payload as MessagePayloads["ASSIGN_COLLECTION"]
      assignCollection(payload.itemIds, payload.collectionId)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "UNASSIGN_COLLECTION": {
      const payload = message.payload as MessagePayloads["UNASSIGN_COLLECTION"]
      unassignCollection(payload.itemIds, payload.collectionId)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "UPDATE_COLLECTION_COLOR": {
      const payload = message.payload as MessagePayloads["UPDATE_COLLECTION_COLOR"]
      updateCollectionColor(payload.id, payload.color)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "REORDER_COLLECTIONS": {
      const payload = message.payload as MessagePayloads["REORDER_COLLECTIONS"]
      reorderCollections(payload.orderedIds)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "PIN_COLLECTION": {
      const payload = message.payload as MessagePayloads["PIN_COLLECTION"]
      setCollectionPinned(payload.id, payload.pinned)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "MOVE_COLLECTION_ITEMS": {
      const payload = message.payload as MessagePayloads["MOVE_COLLECTION_ITEMS"]
      moveCollectionItems(payload.itemIds, payload.fromCollectionId, payload.toCollectionId)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    case "BATCH_DOWNLOAD":
      batchDownload(message.payload as MessagePayloads["BATCH_DOWNLOAD"])
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, errors: [String(e)] }))
      return true

    case "GET_EXPORT_HISTORY":
      getExportHistory()
        .then((history) => sendResponse({ success: true, history }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true

    case "CLEAR_EXPORT_HISTORY":
      clearExportHistory()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true

    case "RETRY_EXPORT_FAILED": {
      // M6 Task 4:重试 failedFiles — 复用 batchDownload 路径,继续写历史(appendExportHistory)
      const payload = message.payload as MessagePayloads["RETRY_EXPORT_FAILED"]
      batchDownload(payload.files)
        .then((result) => sendResponse(result))
        .catch((e) => sendResponse({ success: false, errors: [String(e)] }))
      return true
    }

    case "SHOW_DOWNLOADS_FOLDER": {
      // 打开 Chrome 默认下载目录(用户需再点进 media-collector/<folder>)
      try {
        chrome.downloads.showDefaultFolder()
        sendResponse({ success: true })
      } catch (e) {
        // API 拒绝(权限不足 / 浏览器策略):用系统通知兜底,避免静默失败
        showNote("无法打开下载目录", "请在 Chrome 下载记录中查看")
        sendResponse({ success: false, error: String(e) })
      }
      return true
    }

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
    coverUrl?: string
  },
  callback?: (result: { success: boolean; error?: string; item?: MediaItem }) => void
) {
  const newItem: MediaItem = {
    id: generateId(),
    url: mediaData.url,
    type: (mediaData.type || "image") as "image" | "video",
    platform: (mediaData.platform || "unknown") as "xiaohongshu" | "unknown",
    title: (mediaData.title || "").slice(0, 200),
    sourceUrl: mediaData.sourceUrl || "",
    collectedAt: new Date().toISOString(),
    noteId: mediaData.noteId,
    groupIndex: mediaData.groupIndex,
    width: mediaData.width,
    height: mediaData.height,
    author: mediaData.author,
    coverUrl: mediaData.coverUrl,
  }

  saveItem(newItem)
    .then((result) => {
      if (result.success) {
        showNote("✅ 采集成功", mediaData.title || "素材已添加")
      } else {
        showNote("已存在", "该素材已在采集列表中")
      }
      callback?.({ success: result.success, error: result.error, item: newItem })
    })
    .catch((err) => {
      // storage 写入失败:必须回调,否则调用方(采集按钮)永久 loading
      callback?.({ success: false, error: String(err) })
    })
}
