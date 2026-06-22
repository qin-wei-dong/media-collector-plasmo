// contents/xiaohongshu.ts — 小红书:浮层内采集 + 快捷键采集
// 不再支持列表页 hover 采集(脆弱、视频受限、依赖易改版的瀑布流 DOM)。
// 笔记浮层出现时,浮层内的「采集素材」按钮从 __INITIAL_STATE__ 读取完整笔记数据
// (图集全部图片 或 视频)一键采集。__INITIAL_STATE__ 的跨 world 同步 + API 拦截
// 由 background 通过 chrome.scripting.executeScript({world:"MAIN"}) 注入,
// 这是 MV3 下唯一能绕过页面 CSP 的 MAIN world 注入方式。
//
// 快捷键 Ctrl/Cmd+Shift+S(background commands.collect_media)发 COLLECT_CURRENT_NOTE,
// 由本脚本调 collectCurrentNote() 自主采集当前浮层/详情页(与按钮点击共用同一入口)。
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, showToast } from "../lib/base"
import { collectCurrentNote, startDetailCollector } from "../lib/xhs-detail-collector"

export const config: PlasmoCSConfig = {
  matches: ["https://www.xiaohongshu.com/*"],
  run_at: "document_start",
}

function main() {
  // 1. 请求 background 注入 MAIN world 拦截器(绕过页面 CSP)
  try {
    chrome.runtime.sendMessage({ type: "INJECT_MAIN_WORLD" }, () => {
      void chrome.runtime.lastError
    })
  } catch {}

  // 2. DOM ready 后启动浮层采集器
  const startCollector = () => {
    injectStyles()
    startDetailCollector()
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startCollector)
  } else {
    startCollector()
  }

  // 3. 响应快捷键采集:content script 自主采集 + toast 反馈,
  //    background 据返回的 handled 决定是否显示兜底通知
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "COLLECT_CURRENT_NOTE") {
      collectCurrentNote().then((result) => {
        showToast(result.ok ? result.message : `❌ ${result.message}`)
        sendResponse({ handled: true, ok: result.ok })
      })
      return true // 异步响应
    }
  })
}

main()
