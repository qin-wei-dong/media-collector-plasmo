// background/download.ts — 下载操作

import { MEDIA_COLLECTOR_DIR, type Platform } from "../types"
import { showNote } from "./index"
import { markItemsExported } from "./storage"

/** 单个下载文件描述。filename 是相对路径,可含子目录,如 `618选题/标题_01.jpg`。 */
export type DownloadFile = {
  id?: string
  url: string
  filename: string
  platform?: Platform
}

/** blob 转 data URL(base64)。service worker 没有 URL.createObjectURL,必须用 data URL。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("读取文件失败"))
    reader.readAsDataURL(blob)
  })
}

/** 按平台生成防盗链 Referer(默认小红书)。 */
function refererFor(platform?: Platform): string {
  return platform === "douyin" ? "https://www.douyin.com/" : "https://www.xiaohongshu.com/"
}

/** 从 `folder/name.ext` 提取 folder 段;无目录返回空串。 */
function extractFolder(filename: string): string {
  const idx = filename.lastIndexOf("/")
  return idx >= 0 ? filename.slice(0, idx) : ""
}

/**
 * 路径穿越防御(M4 plan 4.2 / 风险5):拒绝绝对路径和 `.` / `..` 目录段。
 * 按 `/ \` 拆段精确判定,不误伤名字中含 ".." 的合法文件名(如 `5..2促销.jpg`)。
 */
function isUnsafePath(filename: string): boolean {
  if (filename.startsWith("/") || filename.startsWith("\\")) return true
  if (/^[a-zA-Z]:[\\/]/.test(filename)) return true // Windows 盘符绝对路径
  return filename.split(/[\\/]/).some((seg) => seg === "." || seg === "..")
}

/**
 * 在 background(service worker)中直接 fetch + download。
 * service worker 的 fetch 不带页面 cookie,但小红书/抖音的 CDN 图片通常不严格校验 cookie,
 * 只需带上 Referer 即可通过防盗链。
 *
 * M4 改造:
 * - 每个文件按自身 platform 计算 Referer(修复原先统一取第一项 platform 的问题)
 * - filename 可含子目录,最终路径为 `MEDIA_COLLECTOR_DIR/<filename>`
 * - 成功项记录 id 与 folder,下载完成后批量写入 exportedAt
 */
async function fetchAndDownload(
  files: DownloadFile[]
): Promise<{ ok: number; errors: string[]; exportedIds: string[]; folders: string[] }> {
  let ok = 0
  const errors: string[] = []
  const successfulIds: string[] = []
  const folders: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    // 后台路径穿越防御:拒绝绝对路径和 `.` / `..` 段(不误伤含 ".." 的合法文件名)
    if (isUnsafePath(file.filename)) {
      errors.push(`${file.filename}: 非法路径`)
      continue
    }
    try {
      // 先在 service worker 里 fetch(带各自平台 Referer 绕防盗链)
      const resp = await fetch(file.url, {
        headers: { Referer: refererFor(file.platform) },
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      // service worker 没有 URL.createObjectURL,转 data URL(base64)给 chrome.downloads
      const dataUrl = await blobToDataUrl(blob)

      // 用 chrome.downloads 下载(service worker 有此 API)
      await new Promise<void>((resolve, reject) => {
        chrome.downloads.download(
          {
            url: dataUrl,
            filename: MEDIA_COLLECTOR_DIR + "/" + (file.filename || `素材_${i + 1}.jpg`),
            saveAs: false,
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else {
              const onChanged = (delta: chrome.downloads.DownloadDelta) => {
                if (delta.id === downloadId && delta.state?.current === "complete") {
                  chrome.downloads.onChanged.removeListener(onChanged)
                  resolve()
                }
                if (delta.id === downloadId && delta.state?.current === "interrupted") {
                  chrome.downloads.onChanged.removeListener(onChanged)
                  reject(new Error("下载中断"))
                }
              }
              chrome.downloads.onChanged.addListener(onChanged)
              setTimeout(() => {
                chrome.downloads.onChanged.removeListener(onChanged)
                resolve()
              }, 15000)
            }
          }
        )
      })
      ok++
      if (file.id) successfulIds.push(file.id)
      const folder = extractFolder(file.filename)
      if (folder && !folders.includes(folder)) folders.push(folder)
      // 间隔避免节流
      await new Promise((r) => setTimeout(r, 300))
    } catch (e: any) {
      errors.push(`${file.filename || file.url.slice(-20)}: ${e.message}`)
    }
  }

  // 成功项写入 exportedAt(失败不影响下载结果)
  if (successfulIds.length) {
    try {
      await markItemsExported(successfulIds, new Date().toISOString())
    } catch {
      // 标记失败不阻断下载流程
    }
  }

  return { ok, errors, exportedIds: successfulIds, folders }
}

export async function batchDownload(
  files: DownloadFile[]
): Promise<{
  success: boolean
  count?: number
  errors?: string[]
  folder?: string
  folders?: string[]
  exportedIds?: string[]
}> {
  if (!files?.length) return { success: false }

  const result = await fetchAndDownload(files)
  const folder = result.folders.length === 1 ? result.folders[0] : undefined

  if (result.errors.length === 0) {
    showNote("✅ 批量下载完成", `共 ${result.ok} 个文件已保存到 ${MEDIA_COLLECTOR_DIR} 文件夹`)
    return {
      success: true,
      count: result.ok,
      folder,
      folders: result.folders,
      exportedIds: result.exportedIds,
    }
  } else if (result.ok > 0) {
    showNote("⚠️ 部分下载失败", `成功 ${result.ok} / ${files.length}`)
    return {
      success: true,
      count: result.ok,
      errors: result.errors,
      folder,
      folders: result.folders,
      exportedIds: result.exportedIds,
    }
  } else {
    showNote("❌ 下载失败", result.errors[0] || "请稍后重试")
    return { success: false, errors: result.errors }
  }
}
