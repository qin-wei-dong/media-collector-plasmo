// contents/douyin.ts — 抖音：视频采集
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, HoverUIManager, showToast, extractTitle, isContextValid, registerContentMessageHandler } from "../lib/base"

export const config: PlasmoCSConfig = {
  matches: ["https://www.douyin.com/*"],
  run_at: "document_idle",
}

/** 从 DOM 提取抖音作者昵称 */
function extractDouyinAuthor(): string {
  const authorSelectors = [
    '[class*="author"] [class*="name"]',
    '[class*="author"] [class*="nickname"]',
    '[class*="author"] [class*="userName"]',
    '[class*="author-container"] span',
    '[class*="user-nickname"]',
    '[class*="userName"]',
    '[class*="nickname"]',
    '[data-e2e="user-info"] span',
    '[class*="author-name"]',
    '[class*="authorName"]',
  ]
  for (const sel of authorSelectors) {
    const el = document.querySelector(sel)
    if (el) {
      const text = (el.textContent || "").trim()
      if (text.length >= 1 && text.length <= 30) {
        return text
      }
    }
  }
  return ""
}

function main() {

  injectStyles()

  const ui = new HoverUIManager({
    onCollect: (media) => {
      doCollect(media.url, media.type, getCoverUrl(media.el, media.type))
    },
  })

  function getCoverUrl(el: Element, type: string): string {
    if (type !== "video") return ""
    if (el instanceof HTMLVideoElement) return el.poster || ""
    if (el instanceof HTMLImageElement) return el.currentSrc || el.src || ""
    const video = el.querySelector("video")
    if (video?.poster) return video.poster
    const img = el.querySelector("img")
    return img?.currentSrc || img?.src || ""
  }

  function doCollect(url: string, type: string, coverUrl = "") {
    ui.showCollected()
    if (!isContextValid()) {
      ui.resetCollectState()
      return
    }
    try {
      chrome.runtime.sendMessage(
        {
          type: "COLLECT_MEDIA",
          payload: {
            url,
            type,
            platform: "douyin",
            title: extractTitle(),
            sourceUrl: location.href,
            author: extractDouyinAuthor(),
            coverUrl: coverUrl || undefined,
          },
        },
        (resp) => {
          if (chrome.runtime.lastError) {
            ui.resetCollectState()
            return
          }
          if (resp?.success) {
            ui.markDone()
            showToast("✅ 素材已采集")
          } else {
            ui.resetCollectState()
            showToast(resp?.error || "采集失败")
          }
        }
      )
    } catch {
      ui.resetCollectState()
    }
  }

  // 注册消息监听（GET_LAST_MEDIA）
  try {
    registerContentMessageHandler("douyin", ui)
  } catch {
    // 扩展已更新，旧版 content script 静默退出
  }
}

main()
