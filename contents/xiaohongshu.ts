// contents/xiaohongshu.ts — 小红书:浮层内采集
// 不再支持列表页 hover 采集(脆弱、视频受限、依赖易改版的瀑布流 DOM)。
// 笔记浮层出现时,浮层内的「采集素材」按钮从 __INITIAL_STATE__ 读取完整笔记数据
// (图集全部图片 或 视频)一键采集。__INITIAL_STATE__ 的跨 world 同步 + API 拦截
// 由 background 通过 chrome.scripting.executeScript({world:"MAIN"}) 注入,
// 这是 MV3 下唯一能绕过页面 CSP 的 MAIN world 注入方式。
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles } from "../lib/base"
import { startDetailCollector } from "../lib/xhs-detail-collector"

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
}

main()
