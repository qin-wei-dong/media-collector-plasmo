// lib/xhs-image-extractor.ts — 小红书笔记媒体提取
// 两条读取通路,按可靠性优先:
//  1. API 拦截缓存(localStorage.__mc_notes__):首页浮层 CSR 场景,MAIN world 拦截 XHR/fetch 响应缓存
//  2. __INITIAL_STATE__(localStorage.__mc_state__):独立详情页 SSR 场景

export interface XHSImage {
  url: string
  width?: number
  height?: number
}

export interface XHSNoteMedia {
  type: "image" | "video"
  images: XHSImage[]
  videoUrl: string | null
  title: string
  author: string
}

const NOTES_KEY = "__mc_notes__"
const STATE_KEY = "__mc_state__"

/** 读取 __INITIAL_STATE__(回退到 MAIN world 同步的 localStorage 镜像) */
function getState(): any {
  const state = (window as any).__INITIAL_STATE__
  if (state?.note?.noteDetailMap) return state
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

/** 从 video 对象提取视频流 URL(state 结构,camelCase) */
function extractUrlFromVideoObj(video: any): string | null {
  const stream = video?.media?.stream
  if (stream) {
    const candidates = [
      stream.h264?.[0]?.masterUrl,
      stream.h264?.[0]?.backupUrls?.[0],
      stream.h265?.[0]?.masterUrl,
      stream.h265?.[0]?.backupUrls?.[0],
      stream.av1?.[0]?.masterUrl,
      stream.av1?.[0]?.backupUrls?.[0],
    ]
    for (const url of candidates) {
      if (url && typeof url === "string") return url
    }
  }
  return video?.url || null
}

/**
 * 提取指定笔记的媒体数据。
 * 优先读 API 拦截缓存(首页浮层场景);回退 __INITIAL_STATE__(独立详情页 SSR)。
 */
export function getNoteMediaFromState(noteId: string): XHSNoteMedia | null {
  // 通路 1: API 拦截缓存(首页浮层场景最可靠)
  try {
    const cache = JSON.parse(localStorage.getItem(NOTES_KEY) || "{}")
    if (cache[noteId]) return cache[noteId]
  } catch {}

  // 通路 2: __INITIAL_STATE__(独立详情页 SSR)
  const state = getState()
  const map = state?.note?.noteDetailMap
  if (!map) return null

  // 精确匹配;单条目时兜底(key 格式差异),多笔记不猜测
  let entry = map[noteId]?.note
  if (!entry) {
    const keys = Object.keys(map).filter((k) => k !== "undefined" && map[k]?.note)
    if (keys.length === 1) entry = map[keys[0]]?.note
  }
  if (!entry) return null

  const title = String(entry.title || entry.desc || "").slice(0, 200)
  const author =
    entry?.user?.nickname ||
    entry?.author?.nickname ||
    entry?.user?.nickName ||
    entry?.author?.nickName ||
    ""

  const videoUrl = entry.video ? extractUrlFromVideoObj(entry.video) : null
  if (videoUrl) return { type: "video", images: [], videoUrl, title, author }

  const imageList =
    entry.imageList ||
    entry.image_list ||
    entry.noteCard?.imageList ||
    entry.noteCard?.image_list ||
    entry.images ||
    null

  const images: XHSImage[] = (imageList || [])
    .map((img: any) => {
      const info = img.infoList?.[0]
      const rawUrl = String(img.url || info?.url || "")
      return {
        url: rawUrl.replace(/\?imageView2.*$/, ""),
        width: img.width || info?.width,
        height: img.height || info?.height,
      }
    })
    .filter((img: XHSImage) => img.url && !img.url.startsWith("data:"))

  return { type: "image", images, videoUrl: null, title, author }
}
