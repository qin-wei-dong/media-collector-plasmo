// lib/base.ts — 共享：悬停检测、按钮渲染、Toast、样式注入、消息处理
// 不导出 PlasmoCSConfig，由各平台 content script 自行配置

export function injectStyles() {
  const style = document.createElement("style")
  style.textContent = `
    #__mc_highlight {
      position:fixed; z-index:2147483645;
      border:2px solid #ff2d55; border-radius:4px;
      pointer-events:none; opacity:0;
      transition:opacity 0.1s;
      box-shadow:0 0 0 4px rgba(255,45,85,0.15);
    }
    #__mc_highlight.mc_on { opacity:1; }
    #__mc_btn {
      position:fixed; z-index:2147483647;
      width:28px; height:28px;
      background:rgba(255,45,85,0.92);
      color:#fff; border:none; border-radius:50%;
      padding:0; font-size:14px; font-weight:600;
      cursor:pointer;
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,0.2);
      opacity:0; pointer-events:none;
      transition:opacity 0.15s, transform 0.15s, background 0.2s;
      backdrop-filter:blur(4px);
      line-height:1;
    }
    #__mc_btn.mc_on { opacity:1; pointer-events:auto; }
    #__mc_btn:hover { transform:scale(1.12); background:rgba(255,45,85,1); box-shadow:0 3px 12px rgba(255,45,85,0.4); }
    #__mc_btn:active { transform:scale(0.92); }
    #__mc_btn.mc_done { background:rgba(52,199,89,0.92); }
    #__mc_btn.mc_done:hover { background:rgba(52,199,89,1); box-shadow:0 3px 12px rgba(52,199,89,0.4); }

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

// ====== 媒体检测 ======
export function detectMediaAtPoint(x: number, y: number): {
  url: string
  type: string
  el: Element
} | null {
  const elements = document.elementsFromPoint(x, y)
  if (!elements?.length) return null

  // 过滤掉自身 UI 元素和评论区元素
  const candidates = elements.filter((el): el is Element => {
    if ((el as Element).id?.startsWith("__mc_")) return false
    if (isInCommentSection(el)) return false
    return true
  })

  // 优先级 1：直接检测 <video> 元素（视频优先于图片，避免被封面图抢先）
  for (const el of candidates) {
    if (el.tagName.toLowerCase() === "video") {
      const v = el as HTMLVideoElement
      const src = v.src || v.querySelector("source")?.src
      if (src) return { url: src, type: "video", el }
    }
  }

  // 优先级 2：检测候选元素内部是否包含 <video>（视频被封面图覆盖的场景）
  for (const el of candidates) {
    const video = el.querySelector("video")
    if (video) {
      const src = video.src || video.querySelector("source")?.src
      if (src) return { url: src, type: "video", el: video }
    }
  }

  // 优先级 3：普通图片和背景图（但需排除视频封面）
  for (const el of candidates) {
    const tag = el.tagName.toLowerCase()

    if (tag === "img" && (el as HTMLImageElement).src && !(el as HTMLImageElement).src.startsWith("data:")) {
      const mediaType = isVideoCover(el) ? "video" : "image"
      return { url: (el as HTMLImageElement).src, type: mediaType, el }
    }

    if (tag === "div" || tag === "span" || tag === "a" || tag === "li") {
      const bg = getComputedStyle(el).backgroundImage
      if (bg && bg !== "none" && bg.startsWith("url(")) {
        const url = bg.slice(5, -2).replace(/"/g, "")
        if (url && !url.startsWith("data:")) {
          const mediaType = isVideoCover(el) ? "video" : "image"
          return { url, type: mediaType, el }
        }
      }
    }
  }
  return null
}

/** 检查元素是否在评论区容器内 */
function isInCommentSection(el: Element): boolean {
  let node: Element | null = el
  for (let i = 0; i < 10 && node && node !== document.body; i++) {
    const cls = (node.className || "").toString().toLowerCase()
    if (/\bcomment[-_]?list\b|\bcomment[-_]?section\b|\bcomment[-_]?container\b|\bcomment[-_]?box\b|\bcomments[-_]?wrapper\b/.test(cls)) {
      return true
    }
    node = node.parentElement
  }
  return false
}

/** 检查一个图片/元素是否实际上是视频封面（只检查紧邻的视频线索，避免误判） */
function isVideoCover(el: Element): boolean {
  let node: Element | null = el
  for (let i = 0; i < 6 && node && node !== document.body; i++) {
    // 1. 时长标签（最可靠：视频封面上的 "1:23" 标签，图片笔记不会有）
    const spans = node.querySelectorAll(":scope > span")
    for (const span of spans) {
      const text = (span.textContent || "").trim()
      if (/^\d{1,2}:\d{2}$/.test(text)) return true
    }

    // 2. 直接子元素中的播放按钮 SVG（视频封面上常见的 ▶ 图标）
    const directSvgs = node.querySelectorAll(":scope > svg")
    for (const svg of directSvgs) {
      const cls = (svg.className?.baseVal || svg.getAttribute("class") || "").toString().toLowerCase()
      if (cls.includes("play")) return true
      const use = svg.querySelector("use")
      if (use) {
        const href = use.getAttribute("xlink:href") || use.getAttribute("href") || ""
        if (href.includes("play")) return true
      }
    }

    // 3. 子元素 class 含 play-icon / play-btn 等
    for (const child of Array.from(node.children)) {
      const cls = (child.className || "").toString().toLowerCase()
      if (/play[-_]?(?:icon|btn|button|overlay|cover|indicator)/.test(cls)) return true
    }

    // 4. 后代元素含 play-icon class
    if (node.querySelector('[class*="play-icon"], [class*="play-icon-"]')) return true

    // 5. SVG use 引用含 play（后代层级）
    const useEls = node.querySelectorAll("use")
    for (const use of useEls) {
      const href = use.getAttribute("xlink:href") || use.getAttribute("href") || ""
      if (href.includes("play")) return true
    }

    // 6. data 属性标识视频
    if (node.hasAttribute("data-type") && node.getAttribute("data-type") === "video") return true

    node = node.parentElement
  }

  return false
}

// ====== 标题提取 ======
export function extractTitle(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
  if (og?.content) return og.content.slice(0, 200)
  const titleEl =
    document.querySelector("#detail-title") ||
    document.querySelector("h1")
  return ((titleEl?.textContent || document.title) || "").slice(0, 200)
}

// ====== 悬停 UI 管理器 ======
export interface HoverUIConfig {
  onCollect: (media: { url: string; type: string; el: Element }) => void
  getCollectButtonText?: () => string
  /** 悬停检测到媒体时触发（用于预取视频 URL 等） */
  onHover?: (media: { url: string; type: string; el: Element }) => void
}

export class HoverUIManager {
  private highlightEl: HTMLDivElement
  private collectBtn: HTMLButtonElement
  private config: HoverUIConfig

  public lastMedia: { url: string; type: string; el: Element } | null = null
  public collected = false
  public btnHovered = false

  private lastMoveTime = 0

  constructor(config: HoverUIConfig) {
    this.config = config

    // highlight
    this.highlightEl = document.createElement("div")
    this.highlightEl.id = "__mc_highlight"
    document.body.appendChild(this.highlightEl)

    // collect button
    this.collectBtn = document.createElement("button")
    this.collectBtn.id = "__mc_btn"
    this.collectBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
    this.collectBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (this.lastMedia) config.onCollect(this.lastMedia)
    })
    this.collectBtn.addEventListener("mouseenter", () => {
      this.btnHovered = true
    })
    this.collectBtn.addEventListener("mouseleave", () => {
      this.btnHovered = false
      if (!this.collected) this.hideAll()
    })
    document.body.appendChild(this.collectBtn)

    // mouse move
    document.addEventListener(
      "mousemove",
      (e) => {
        if (this.collected) return
        const now = Date.now()
        if (now - this.lastMoveTime < 80) return
        this.lastMoveTime = now

        const media = detectMediaAtPoint(e.clientX, e.clientY)
        if (media) {
          if (!this.lastMedia || this.lastMedia.el !== media.el) this.showAll(media)
        } else {
          this.hideAll()
        }
      },
      { passive: true }
    )

    // 滚动时实时更新按钮位置
    document.addEventListener(
      "scroll",
      () => {
        if (this.lastMedia && !this.collected) {
          this.positionButton(this.lastMedia.el)
        }
      },
      { passive: true, capture: true }
    )
  }

  showAll(media: { url: string; type: string; el: Element }) {
    const rect = media.el.getBoundingClientRect()
    this.highlightEl.style.left = rect.left + "px"
    this.highlightEl.style.top = rect.top + "px"
    this.highlightEl.style.width = rect.width + "px"
    this.highlightEl.style.height = rect.height + "px"
    this.highlightEl.classList.add("mc_on")

    this.positionButton(media.el)

    // 触发 hover 钩子（用于预取视频 URL）
    if (this.config.onHover) {
      try {
        this.config.onHover(media)
      } catch {}
    }

    if (!this.collected) {
      this.collectBtn.classList.remove("mc_done")
      this.collectBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
    }
    this.collectBtn.classList.add("mc_on")
    this.lastMedia = media
  }

  hideAll() {
    this.highlightEl.classList.remove("mc_on")
    if (!this.btnHovered && !this.collected) {
      this.collectBtn.classList.remove("mc_on")
      this.lastMedia = null
    }
  }

  showCollected() {
    this.collected = true
    this.collectBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`
    this.collectBtn.style.pointerEvents = "none"
  }

  resetCollectState() {
    this.collectBtn.classList.remove("mc_done")
    this.collectBtn.classList.remove("mc_on")
    this.highlightEl.classList.remove("mc_on")
    this.collectBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
    this.collectBtn.style.pointerEvents = "auto"
    this.collected = false
    this.lastMedia = null
  }

  markDone() {
    this.collectBtn.classList.add("mc_done")
    this.collectBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`

    setTimeout(() => this.resetCollectState(), 1500)
  }

  private positionButton(el: Element) {
    const rect = el.getBoundingClientRect()
    const btnSize = 28
    const gap = 6

    // 右上角
    let x = rect.right - btnSize - gap
    let y = rect.top + gap

    // 水平约束
    if (x < gap) x = gap
    if (x + btnSize > window.innerWidth - gap) x = window.innerWidth - btnSize - gap

    // 垂直约束
    if (y < gap) y = gap
    if (y + btnSize > window.innerHeight - gap) y = window.innerHeight - btnSize - gap

    this.collectBtn.style.left = x + "px"
    this.collectBtn.style.top = y + "px"
  }
}

// ====== 跨平台共享函数 ======

/** 检查扩展 context 是否仍然有效（处理扩展更新/重载） */
export function isContextValid(): boolean {
  return !!chrome.runtime?.id
}

/**
 * 注册 content script 的消息监听器（GET_LAST_MEDIA）
 * 各平台 content script 共用，仅需传入平台标识和 ui 实例
 */
export function registerContentMessageHandler(
  platform: "xiaohongshu" | "douyin",
  ui: HoverUIManager
): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_LAST_MEDIA") {
      const media = ui.lastMedia
        ? {
            url: ui.lastMedia.url,
            type: ui.lastMedia.type,
            platform,
            title: extractTitle(),
            sourceUrl: location.href,
          }
        : null
      sendResponse({ success: true, media })
    }
    return true
  })
}
