// contents/douyin.ts — 抖音：视频采集（v2.0 保持 v1.0 逻辑）
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, HoverUIManager, showToast, extractTitle } from "./base"

export const config: PlasmoCSConfig = {
  matches: ["https://www.douyin.com/*"],
  run_at: "document_idle",
}

function main() {
  console.log("🔍 素材采集助手已激活 [douyin]")

  injectStyles()

  const ui = new HoverUIManager({
    onCollect: (media) => {
      doCollect(media.url, media.type)
    },
  })

  function doCollect(url: string, type: string) {
    ui.showCollected()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_MEDIA",
        payload: {
          url,
          type,
          platform: "douyin",
          title: extractTitle(),
          sourceUrl: location.href,
        },
      },
      (resp) => {
        if (resp?.success) {
          ui.markDone()
          showToast("✅ 素材已采集")
        } else {
          ui.resetCollectState()
          showToast(resp?.error || "采集失败")
        }
      }
    )
  }

  // ====== 响应后台消息 ======
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_LAST_MEDIA") {
      const media = ui.lastMedia
        ? {
            url: ui.lastMedia.url,
            type: ui.lastMedia.type,
            platform: "douyin",
            title: extractTitle(),
            sourceUrl: location.href,
          }
        : null
      sendResponse({ success: true, media })
    }
    return true
  })

  console.log("✅ 抖音就绪 — 悬停视频采集")
}

main()
