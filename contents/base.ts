// contents/base.ts — 共享：悬停检测、按钮渲染、Toast、样式注入
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
      background:linear-gradient(135deg,#ff2d55,#ff6b81);
      color:#fff; border:none; border-radius:0 0 14px 14px;
      padding:10px 32px; font-size:14px; font-weight:600;
      cursor:pointer; white-space:nowrap; letter-spacing:0.5px;
      box-shadow:0 4px 14px rgba(255,45,85,0.4);
      opacity:0; pointer-events:none;
      transition:opacity 0.1s, transform 0.12s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      transform:translateX(-50%);
    }
    #__mc_btn.mc_on { opacity:1; pointer-events:auto; }
    #__mc_btn:hover { transform:translateX(-50%) scale(1.04); box-shadow:0 5px 18px rgba(255,45,85,0.55); }
    #__mc_btn:active { transform:translateX(-50%) scale(0.96); }
    #__mc_btn.mc_done { background:linear-gradient(135deg,#34c759,#30d158); box-shadow:0 4px 14px rgba(52,199,89,0.4); }

    #__mc_note_btn {
      position:fixed; z-index:2147483647;
      background:linear-gradient(135deg,#5856d6,#af52de);
      color:#fff; border:none; border-radius:0 0 14px 14px;
      padding:10px 28px; font-size:13px; font-weight:600;
      cursor:pointer; white-space:nowrap; letter-spacing:0.5px;
      box-shadow:0 4px 14px rgba(88,86,214,0.4);
      opacity:0; pointer-events:none;
      transition:opacity 0.1s, transform 0.12s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      transform:translateX(-50%);
    }
    #__mc_note_btn.mc_on { opacity:1; pointer-events:auto; }
    #__mc_note_btn:hover { transform:translateX(-50%) scale(1.04); box-shadow:0 5px 18px rgba(88,86,214,0.55); }
    #__mc_note_btn:active { transform:translateX(-50%) scale(0.96); }
    #__mc_note_btn.mc_done { background:linear-gradient(135deg,#34c759,#30d158); box-shadow:0 4px 14px rgba(52,199,89,0.4); }

    #__mc_select_modal {
      position:fixed; z-index:2147483648;
      background:#fff; border-radius:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.2);
      padding:16px; min-width:240px;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      opacity:0; pointer-events:none;
      transition:opacity 0.15s;
    }
    #__mc_select_modal.mc_on { opacity:1; pointer-events:auto; }

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

  for (const el of elements) {
    if (el.id.startsWith("__mc_")) continue

    const tag = el.tagName.toLowerCase()

    if (tag === "img" && (el as HTMLImageElement).src && !(el as HTMLImageElement).src.startsWith("data:")) {
      return { url: (el as HTMLImageElement).src, type: "image", el }
    }

    if (tag === "video") {
      const v = el as HTMLVideoElement
      const src = v.src || v.querySelector("source")?.src
      if (src) return { url: src, type: "video", el }
    }

    if (tag === "div" || tag === "span" || tag === "a" || tag === "li") {
      const bg = getComputedStyle(el).backgroundImage
      if (bg && bg !== "none" && bg.startsWith("url(")) {
        const url = bg.slice(5, -2).replace(/"/g, "")
        if (url && !url.startsWith("data:")) return { url, type: "image", el }
      }
    }
  }
  return null
}

// ====== 标题提取 ======
export function extractTitle(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
  if (og?.content) return og.content.slice(0, 200)
  const titleEl =
    document.querySelector("#detail-title") ||
    document.querySelector('[class*="title"]') ||
    document.querySelector("h1")
  return ((titleEl?.textContent || document.title) || "").slice(0, 200)
}

// ====== 悬停 UI 管理器 ======
export interface HoverUIConfig {
  onCollect: (media: { url: string; type: string; el: Element }) => void
  onNoteCollect?: () => void
  getCollectButtonText?: () => string
}

export class HoverUIManager {
  private highlightEl: HTMLDivElement
  private collectBtn: HTMLButtonElement
  private noteBtn: HTMLButtonElement | null = null
  private config: HoverUIConfig

  public lastMedia: { url: string; type: string; el: Element } | null = null
  public collected = false
  public btnHovered = false
  public noteBtnHovered = false

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
    this.collectBtn.textContent = config.getCollectButtonText?.() ?? "📥 采集"
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
  }

  showAll(media: { url: string; type: string; el: Element }) {
    const rect = media.el.getBoundingClientRect()
    this.highlightEl.style.left = rect.left + "px"
    this.highlightEl.style.top = rect.top + "px"
    this.highlightEl.style.width = rect.width + "px"
    this.highlightEl.style.height = rect.height + "px"
    this.highlightEl.classList.add("mc_on")

    this.positionButton(media.el)

    if (!this.collected) {
      this.collectBtn.classList.remove("mc_done")
      this.collectBtn.textContent = this.config.getCollectButtonText?.() ?? "📥 采集"
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
    this.collectBtn.textContent = "..."
    this.collectBtn.style.pointerEvents = "none"
  }

  resetCollectState() {
    this.collectBtn.classList.remove("mc_done")
    this.collectBtn.classList.remove("mc_on")
    this.highlightEl.classList.remove("mc_on")
    this.collectBtn.textContent = this.config.getCollectButtonText?.() ?? "📥 采集"
    this.collectBtn.style.pointerEvents = "auto"
    this.collected = false
    this.lastMedia = null
  }

  markDone() {
    this.collectBtn.classList.add("mc_done")
    this.collectBtn.textContent = "✅ 已采集"

    setTimeout(() => this.resetCollectState(), 1500)
  }

  private positionButton(el: Element) {
    const rect = el.getBoundingClientRect()
    let x = rect.left + rect.width / 2
    let y = rect.bottom + 4
    if (y + 40 > window.innerHeight) y = rect.top - 44
    this.collectBtn.style.left = x + "px"
    this.collectBtn.style.top = y + "px"
  }
}
