// lib/base.ts — 内容脚本共享工具:Toast 提示 + 样式注入 + context 有效性检查
// 不导出 PlasmoCSConfig,由各平台 content script 自行配置。
//
// 2026-06 清理:已移除废弃的列表页 hover 采集 UI —— HoverUIManager / detectMediaAtPoint /
// isVideoCover / isInCommentSection / extractTitle / registerContentMessageHandler。
// 这些来自已下线的 hover 设计(hover + DOM 猜测,被 XHS 反爬击溃),全部零调用者。
// 当前唯一在用的采集入口是 lib/xhs-detail-collector.ts 的浮层「采集素材」按钮。

// ====== 样式注入(仅 Toast) ======
export function injectStyles() {
  const style = document.createElement("style")
  style.textContent = `
    .mc_toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.8); color:#fff; padding:10px 24px; border-radius:20px;
      font-size:14px; z-index:2147483647; pointer-events:none;
      opacity:0; transition:opacity 0.2s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    }
    .mc_toast.mc_show { opacity:1; }
  `
  document.head.appendChild(style)
}

// ====== Toast ======
let toastEl: HTMLDivElement | null = null

export function showToast(msg: string) {
  if (!toastEl) {
    toastEl = document.createElement("div")
    toastEl.className = "mc_toast"
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = msg
  toastEl.classList.add("mc_show")
  clearTimeout((toastEl as any)._t)
  ;(toastEl as any)._t = setTimeout(() => toastEl?.classList.remove("mc_show"), 1800)
}

// ====== 跨平台共享函数 ======

/** 检查扩展 context 是否仍然有效（处理扩展更新/重载） */
export function isContextValid(): boolean {
  return !!chrome.runtime?.id
}
