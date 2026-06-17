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
  coverUrl?: string
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

function normalizeCoverUrl(value: string): string {
  const url = value.trim()
  if (!/^https?:\/\//.test(url)) return ""
  if (url.startsWith("data:") || url.startsWith("blob:")) return ""
  return url.replace(/\?imageView2.*$/, "")
}

function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return (
    /\.(mp4|m3u8|mov|flv)(?:[?#]|$)/.test(lower) ||
    lower.includes("sns-video") ||
    lower.includes("/video/") ||
    lower.includes("video/tos")
  )
}

function scoreCoverUrl(url: string, path: string): number {
  const lowerUrl = url.toLowerCase()
  const lowerPath = path.toLowerCase()
  if (isVideoUrl(lowerUrl)) return -1
  if (lowerPath.includes("avatar") || lowerUrl.includes("sns-avatar") || lowerUrl.includes("/avatar/")) return -1

  let score = 0
  if (/cover|poster|thumbnail|thumb|first[_-]?frame|preview/.test(lowerPath)) score += 80
  if (/image|img|pic|photo/.test(lowerPath)) score += 40
  if (/image|img|webpic|sns-img|sns-webpic/.test(lowerUrl)) score += 30
  if (/image[_-]?list|imagelist|images/.test(lowerPath)) score += 20
  return score
}

function extractCoverUrlFromVideoObj(video: any, entry?: any): string {
  const roots = [video, entry?.noteCard, entry?.note_card, entry]
  const seen = new Set<any>()
  const candidates: Array<{ url: string; score: number; order: number }> = []
  let order = 0

  function visit(value: any, path: string, depth: number) {
    if (value == null || depth > 7) return
    if (typeof value === "string") {
      const url = normalizeCoverUrl(value)
      if (!url) return
      const score = scoreCoverUrl(url, path)
      if (score > 0) candidates.push({ url, score, order: order++ })
      return
    }
    if (typeof value !== "object" || seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1))
      return
    }

    for (const [key, child] of Object.entries(value)) {
      visit(child, path ? `${path}.${key}` : key, depth + 1)
    }
  }

  roots.forEach((root, index) => visit(root, index === 0 ? "video" : `entry${index}`, 0))
  candidates.sort((a, b) => b.score - a.score || a.order - b.order)
  return candidates[0]?.url || ""
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
  if (videoUrl) {
    return {
      type: "video",
      images: [],
      videoUrl,
      coverUrl: extractCoverUrlFromVideoObj(entry.video, entry),
      title,
      author,
    }
  }

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
