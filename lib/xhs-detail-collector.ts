// lib/xhs-detail-collector.ts — 小红书笔记浮层内采集
// 信息流点击笔记弹出浮层(modal)时,在浮层内(左上角)显示「采集素材」按钮,跟随浮层位置;
// 浮层关闭则隐藏;列表页不显示。一键采集当前笔记的全部图片或视频,
// 数据从 __INITIAL_STATE__ 读取(经 localStorage 桥跨 world)。
import { showToast, isContextValid } from "./base"
import { getNoteMediaFromState, type XHSNoteMedia, type XHSImage } from "./xhs-image-extractor"

const BTN_ID = "__mc_detail_btn"
const STYLE_ID = "__mc_detail_style"

// 笔记浮层容器候选选择器(XHS 笔记详情 modal;多候选提升对改版的鲁棒性)
const NOTE_CONTAINER_SELECTORS = [
  '[class*="note-detail"]',
  '[class*="noteDetail"]',
  '[class*="note-container"]',
  '[class*="noteContainer"]',
  '[class*="note-detail-mask"]',
]

const DETAIL_URL_RE = /\/(?:explore|discovery\/item)\/[a-f0-9]{24}/

function getNoteIdFromUrl(): string {
  const m = location.pathname.match(/\/(?:explore|discovery\/item)\/([a-f0-9]{24})/)
  return m?.[1] || ""
}

function isDetailPage(): boolean {
  return DETAIL_URL_RE.test(location.pathname)
}

function isVisible(el: Element): boolean {
  if (!document.body.contains(el)) return false
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false
  const style = window.getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden") return false
  if (parseFloat(style.opacity) === 0) return false
  return true
}

/** 查找当前可见的笔记浮层容器(取面积最大的可见匹配,避免命中嵌套小元素) */
function findNoteContainer(): Element | null {
  let best: Element | null = null
  let bestArea = 0
  for (const sel of NOTE_CONTAINER_SELECTORS) {
    const els = document.querySelectorAll(sel)
    for (const el of els) {
      if (!isVisible(el)) continue
      const r = el.getBoundingClientRect()
      const area = r.width * r.height
      if (area > bestArea) {
        bestArea = area
        best = el
      }
    }
  }
  return best
}

/** 判断图片 URL 是否为头像/静态图标(非素材) */
function isAvatarOrIcon(src: string): boolean {
  return (
    src.startsWith("data:") ||
    src.includes("sns-avatar") ||
    src.includes("/avatar/")
  )
}

/** 计算元素与当前视口的可见交集面积(用于排除 swiper 视口外的幻灯片) */
function visibleArea(r: DOMRect): number {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
  const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
  return ix * iy
}

/**
 * 在作用域内查找主媒体元素(用于按钮定位):
 * 视频笔记 → 可见面积最大的 <video>;图集笔记 → 可见面积最大的非头像 <img>。
 * 关键:用【与视口的交集面积】而非元素自身面积,排除 swiper 绝对定位在视口外的
 * 预备/历史幻灯片(它们 offsetParent 非空、有尺寸,但 left 为负/超出视口)。
 */
function findMediaEl(scope: ParentNode): Element | null {
  // 1. 视频
  const videos = Array.from(scope.querySelectorAll("video"))
  let bestVideo: Element | null = null
  let bestVideoVis = 0
  for (const v of videos) {
    if (!isVisible(v)) continue
    const vis = visibleArea(v.getBoundingClientRect())
    if (vis > bestVideoVis) {
      bestVideoVis = vis
      bestVideo = v
    }
  }
  if (bestVideo && bestVideoVis > 0) return bestVideo

  // 2. 图集
  const imgs = Array.from(scope.querySelectorAll("img"))
  let bestImg: Element | null = null
  let bestImgVis = 0
  for (const img of imgs) {
    if (!isVisible(img)) continue
    const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || ""
    if (isAvatarOrIcon(src)) continue
    const r = img.getBoundingClientRect()
    if (r.width < 120 || r.height < 120) continue
    const vis = visibleArea(r)
    if (vis > bestImgVis) {
      bestImgVis = vis
      bestImg = img
    }
  }
  return bestImg
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement("style")
  style.id = STYLE_ID
  style.textContent = `
    #${BTN_ID} {
      position: fixed; z-index: 2147483647;
      background: linear-gradient(135deg,#ff2d55,#ff6b81); color:#fff;
      border:none; border-radius:20px; padding:9px 16px;
      font-size:13px; font-weight:600; cursor:pointer;
      box-shadow:0 4px 14px rgba(255,45,85,0.4);
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      display:none; align-items:center; gap:5px; white-space:nowrap;
      transition:transform 0.15s, box-shadow 0.15s, opacity 0.2s;
      user-select:none;
    }
    #${BTN_ID}:hover { transform:scale(1.05); box-shadow:0 6px 18px rgba(255,45,85,0.55); }
    #${BTN_ID}:active { transform:scale(0.95); }
    #${BTN_ID}.mc_done { background:linear-gradient(135deg,#34c759,#30d158); box-shadow:0 4px 14px rgba(52,199,89,0.4); }
    #${BTN_ID}.mc_loading { opacity:0.75; pointer-events:none; }
  `
  document.head.appendChild(style)
}

function setBtnText(btn: HTMLButtonElement, text: string) {
  const span = btn.querySelector("span")
  if (span) span.textContent = text
}

/**
 * 启动浮层采集器:笔记浮层出现时在主媒体(图片/视频)的左上角显示「采集素材」按钮;
 * 浮层关闭则隐藏。独立详情页(直接打开笔记链接、无浮层容器)在 document 范围找主媒体。
 */
export function startDetailCollector() {
  injectStyles()

  let btn: HTMLButtonElement | null = null
  let currentContainer: Element | null = null

  /**
   * 获取/创建按钮。挂进浮层容器内部(可挂载、继承 z-index、跟随浮层)。
   * 不挂媒体元素内部(<img> 是 void 不能有子节点)。
   */
  function ensureButton(mount: Element): HTMLButtonElement {
    if (btn && mount.contains(btn) && btn.parentElement === mount) return btn
    if (btn && btn.parentElement) btn.parentElement.removeChild(btn)
    btn = document.createElement("button")
    btn.id = BTN_ID
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>采集素材</span>`
    btn.addEventListener("click", onCollectClick)
    mount.appendChild(btn)
    return btn
  }

  function showButton(container: Element | null) {
    // 统一挂浮层容器(或 body),保证继承 z-index + 随浮层清理
    const mount = container || document.body
    const b = ensureButton(mount)
    b.classList.remove("mc_done", "mc_loading")
    setBtnText(b, "采集素材")
    // display 由 positionButton 决定:媒体就绪才显示,避免位置跳动
    positionButton(container)
  }

  function hideButton() {
    if (btn) btn.style.display = "none"
  }

  /**
   * 按钮定位:统一用 fixed 相对视口,贴主媒体元素左上角内侧。
   * 稳定性确认:找到媒体后先隐藏,记录候选位置;150ms 后复检,
   * 位置未变才显示 → 按钮直接出现在最终位置,无跳动。
   * 找不到媒体则保持隐藏。
   */
  function positionButton(container: Element | null) {
    if (!btn) return
    const gap = 14
    const scope: ParentNode = container || document
    const mediaEl = findMediaEl(scope)

    if (!mediaEl) {
      // 媒体未就绪 → 隐藏,等下次 sync
      btn.style.display = "none"
      pendingPos = null
      return
    }

    const r = mediaEl.getBoundingClientRect()
    const left = Math.round(r.left + gap)
    const top = Math.round(r.top + gap)
    const posKey = left + "," + top

    // 先定位(即使暂不显示,坐标也要先设好)
    btn.style.position = "fixed"
    btn.style.left = left + "px"
    btn.style.top = top + "px"
    btn.style.right = ""

    // 稳定性确认:位置与上次候选相同 → 显示;不同 → 更新候选,等下次复检
    if (posKey === pendingPos) {
      // 连续两次位置一致 → 浮层稳定,显示按钮
      btn.style.display = "flex"
      if (confirmTimer) {
        clearTimeout(confirmTimer)
        confirmTimer = null
      }
    } else {
      // 首次或位置变化 → 暂隐藏,记录候选,150ms 后复检
      btn.style.display = "none"
      pendingPos = posKey
      if (confirmTimer) clearTimeout(confirmTimer)
      confirmTimer = window.setTimeout(() => {
        confirmTimer = null
        // 复检:重新算位置,若与 pendingPos 一致则显示
        sync()
      }, 150)
    }
  }

  function onCollectClick() {
    const b = btn
    if (!b) return
    if (!isContextValid()) {
      showToast("❌ 插件已更新,请刷新页面后重试")
      return
    }
    const noteId = getNoteIdFromUrl()
    if (!noteId) {
      showToast("❌ 未识别到笔记")
      return
    }
    b.classList.add("mc_loading")
    const media = getNoteMediaFromState(noteId)
    if (!media) {
      b.classList.remove("mc_loading")
      showToast("❌ 读取笔记数据失败,请稍后重试")
      return
    }
    if (media.type === "video" && media.videoUrl) {
      collectVideo(media, noteId)
    } else if (media.images.length > 0) {
      collectImages(media.images, noteId, media.title, media.author)
    } else {
      b.classList.remove("mc_loading")
      showToast("❌ 未找到可采集的素材")
    }
  }

  function collectVideo(media: XHSNoteMedia, noteId: string) {
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_MEDIA",
        payload: {
          url: media.videoUrl,
          type: "video",
          platform: "xiaohongshu",
          title: media.title,
          sourceUrl: location.href,
          noteId,
          author: media.author,
        },
      },
      (resp) => {
        btn?.classList.remove("mc_loading")
        if (chrome.runtime.lastError || !isContextValid()) {
          showToast("❌ 采集失败")
          return
        }
        if (resp?.success) markDone("✅ 视频已采集")
        else showToast(resp?.error || "采集失败")
      }
    )
  }

  function collectImages(images: XHSImage[], noteId: string, title: string, author: string) {
    // 首图作为整个笔记的封面(给 popup Hero/MediaCard 显示用)
    const coverUrl = images[0]?.url || ""
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_NOTE_IMAGES",
        payload: {
          noteId,
          images: images.map((img, i) => ({
            url: img.url,
            width: img.width,
            height: img.height,
            groupIndex: i,
            coverUrl, // 每条都带封面,方便 popup 取
          })),
          title: title || "未命名笔记",
          sourceUrl: location.href,
          author,
        },
      },
      (resp) => {
        btn?.classList.remove("mc_loading")
        if (chrome.runtime.lastError || !isContextValid()) {
          showToast("❌ 采集失败")
          return
        }
        if (resp?.success) markDone(`✅ 已采集 ${images.length} 张图片`)
        else showToast(resp?.error || "采集失败")
      }
    )
  }

  function markDone(msg: string) {
    const b = btn
    if (!b) return
    b.classList.add("mc_done")
    setBtnText(b, "已采集")
    showToast(msg)
    setTimeout(() => {
      b.classList.remove("mc_done")
      setBtnText(b, "采集素材")
    }, 2000)
  }

  // ====== 浮层/详情页检测:决定按钮显隐与位置 ======
  // 稳定性确认:记录上次候选位置,连续两次相同才显示按钮(避免从错位置跳到对位置)
  let pendingPos: string | null = null // 待确认的位置 "left,top"
  let confirmTimer: number | null = null

  function sync() {
    const container = findNoteContainer()
    if (container) {
      currentContainer = container
      showButton(container)
    } else if (isDetailPage()) {
      // 独立详情页(无浮层容器)兜底
      currentContainer = null
      showButton(null)
    } else {
      currentContainer = null
      pendingPos = null
      if (confirmTimer) {
        clearTimeout(confirmTimer)
        confirmTimer = null
      }
      hideButton()
    }
  }

  // 节流:XHS SPA 的 DOM mutation 极频繁,合并到 200ms 一次
  let syncTimer: number | null = null
  function scheduleSync() {
    if (syncTimer !== null) return
    syncTimer = window.setTimeout(() => {
      syncTimer = null
      sync()
    }, 200)
  }

  // MutationObserver:浮层 DOM 增删时即时响应
  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.body, { childList: true, subtree: true })

  // 路由变化(SPA):浮层开关常伴随 URL 变化
  const wrap = (key: "pushState" | "replaceState") => {
    const orig: (...args: any[]) => void = (history[key] as any).bind(history)
    ;(history as any)[key] = (...args: any[]) => {
      const ret = orig(...args)
      setTimeout(sync, 0)
      return ret
    }
  }
  wrap("pushState")
  wrap("replaceState")
  window.addEventListener("popstate", sync)

  // 浮层位置可能因 resize 变化 → 用当前容器重新定位
  window.addEventListener("resize", () => positionButton(currentContainer))

  // 兜底轮询:捕获遗漏的状态变化(浮层选择器未命中时仍有机会重试)
  setInterval(scheduleSync, 800)

  sync()
}
