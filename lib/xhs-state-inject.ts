// lib/xhs-state-inject.ts — MAIN world 拦截器
//
// 这个函数会被 chrome.scripting.executeScript({ world: "MAIN", func }) 注入到
// 页面 context 执行。MV3 下 executeScript 不受页面 CSP 约束(唯一可靠的绕过方式)。
//
// 注意:
// 1. 函数必须是"独立"的——executeScript 的 func 会被序列化注入,不能闭包外部变量。
// 2. 运行在 MAIN world,可直接访问/修改 window.__INITIAL_STATE__、fetch、XMLHttpRequest。
// 3. 拦截 __INITIAL_STATE__ 赋值 + fetch/XHR 响应,把笔记媒体缓存到 localStorage。

/**
 * 在 MAIN world 执行的拦截器(由 background 通过 executeScript 注入)。
 * executeScript 会序列化整个函数体注入页面,所以这里不能引用任何外部作用域。
 */
export function stateInjector() {
  if ((window as any).__mcInjected) return
  ;(window as any).__mcInjected = true

  const STATE_KEY = "__mc_state__"
  const NOTES_KEY = "__mc_notes__"

  // ====== 通路 1: __INITIAL_STATE__ 拦截(独立详情页 SSR) ======
  let _val: any = (window as any).__INITIAL_STATE__
  try {
    if (_val) localStorage.setItem(STATE_KEY, JSON.stringify(_val))
  } catch {}

  try {
    Object.defineProperty(window, "__INITIAL_STATE__", {
      configurable: true,
      enumerable: true,
      get() {
        return _val
      },
      set(v: any) {
        _val = v
        if (v) {
          try {
            localStorage.setItem(STATE_KEY, JSON.stringify(v))
          } catch {}
        }
      },
    })
  } catch {}

  // ====== 通路 2: fetch/XHR 拦截(首页浮层 CSR) ======

  function extractNoteMedia(raw: any) {
    const card = raw.note_card || raw.noteCard || raw
    const title = String(card.title || card.desc || "").slice(0, 200)
    const user = card.user || card.author || {}
    const author = user.nickname || user.nickName || ""

    const video = card.video
    if (video?.media?.stream) {
      const s = video.media.stream
      const url =
        s.h264?.[0]?.master_url || s.h264?.[0]?.masterUrl ||
        s.h265?.[0]?.master_url || s.h265?.[0]?.masterUrl ||
        s.av1?.[0]?.master_url || s.av1?.[0]?.masterUrl
      if (url) return { type: "video", images: [], videoUrl: url, title, author }
    }
    if (video?.url) return { type: "video", images: [], videoUrl: video.url, title, author }

    const list = card.image_list || card.imageList || card.images || []
    const images = (Array.isArray(list) ? list : [])
      .map((img: any) => {
        const url = String(img.url || img.info_list?.[0]?.url || img.infoList?.[0]?.url || "")
        return {
          url: url.replace(/\?imageView2.*$/, ""),
          width: img.width,
          height: img.height,
        }
      })
      .filter((img: any) => img.url && !img.url.startsWith("data:"))

    if (images.length > 0) return { type: "image", images, videoUrl: null, title, author }
    return null
  }

  function collectNotes(data: any, out: any[], depth = 0) {
    if (!data || typeof data !== "object" || depth > 8) return
    if (Array.isArray(data)) {
      for (const it of data) collectNotes(it, out, depth + 1)
      return
    }
    const id = data.note_id || data.noteId || data.id
    const hasMedia = data.image_list || data.imageList || data.video || data.note_card || data.noteCard
    if (typeof id === "string" && /^[a-f0-9]{24}$/.test(id) && hasMedia) {
      out.push({ id, raw: data })
    }
    for (const v of Object.values(data)) collectNotes(v, out, depth + 1)
  }

  function processApiResponse(_url: string, json: any) {
    const notes: any[] = []
    collectNotes(json, notes)
    if (!notes.length) return

    let cache: Record<string, any> = {}
    try {
      cache = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}")
    } catch {}
    let changed = false
    for (const n of notes) {
      const media = extractNoteMedia(n.raw)
      if (media) {
        cache[n.id] = media
        changed = true
      }
    }
    const keys = Object.keys(cache)
    if (keys.length > 200) {
      for (const k of keys.slice(0, keys.length - 150)) delete cache[k]
    }
    if (changed) {
      try {
        localStorage.setItem(NOTES_KEY, JSON.stringify(cache))
      } catch {}
    }
  }

  // 拦截 XHR
  const _open = XMLHttpRequest.prototype.open
  const _send = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (this: any, m: string, u: string) {
    this.__mcUrl = u
    return _open.apply(this, arguments as any)
  }
  XMLHttpRequest.prototype.send = function (this: any, body: any) {
    const self = this
    this.addEventListener("load", function () {
      try {
        const ct = self.getResponseHeader("content-type") || ""
        if (!ct.includes("json")) return
        processApiResponse(self.__mcUrl || "", JSON.parse(self.responseText))
      } catch {}
    })
    return _send.apply(this, arguments as any)
  }

  // 拦截 fetch
  const _fetch = window.fetch
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    return _fetch.apply(this, arguments as any).then((resp: Response) => {
      try {
        const u = typeof input === "string" ? input : (input as Request)?.url || ""
        if ((resp.headers.get("content-type") || "").includes("json")) {
          resp.clone().json().then((j) => processApiResponse(u, j)).catch(() => {})
        }
      } catch {}
      return resp
    })
  }
}
