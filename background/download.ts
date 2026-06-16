// background/download.ts — 下载操作

import { MEDIA_COLLECTOR_DIR } from "../types"
import { showNote } from "./index"

/** blob 转 data URL(base64)。service worker 没有 URL.createObjectURL,必须用 data URL。 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("读取文件失败"))
    reader.readAsDataURL(blob)
  })
}

/**
 * 在 background(service worker)中直接 fetch + download。
 * service worker 的 fetch 不带页面 cookie,但小红书/抖音的 CDN 图片通常不严格校验 cookie,
 * 只需带上 Referer 即可通过防盗链。
 */
async function fetchAndDownload(
  urls: string[],
  filenames: string[],
  platform: "xiaohongshu" | "douyin"
): Promise<{ ok: number; errors: string[] }> {
  let ok = 0
  const errors: string[] = []
  const referer =
    platform === "xiaohongshu" ? "https://www.xiaohongshu.com/" : "https://www.douyin.com/"

  for (let i = 0; i < urls.length; i++) {
    try {
      // 先在 service worker 里 fetch(带 Referer 绕防盗链)
      const resp = await fetch(urls[i], {
        headers: { Referer: referer },
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
            filename: MEDIA_COLLECTOR_DIR + "/" + (filenames[i] || `素材_${i + 1}.jpg`),
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
      // 间隔避免节流
      await new Promise((r) => setTimeout(r, 300))
    } catch (e: any) {
      errors.push(`${filenames[i] || urls[i].slice(-20)}: ${e.message}`)
    }
  }

  return { ok, errors }
}

export async function batchDownload(
  files: { url: string; filename: string; platform?: string }[]
): Promise<{ success: boolean; count?: number; errors?: string[] }> {
  if (!files?.length) return { success: false }

  const urls = files.map((f) => f.url)
  const filenames = files.map((f) => f.filename)
  const platform = (files[0].platform as "xiaohongshu" | "douyin") || "xiaohongshu"

  const result = await fetchAndDownload(urls, filenames, platform)

  if (result.errors.length === 0) {
    showNote("✅ 批量下载完成", `共 ${result.ok} 个文件已保存到 ${MEDIA_COLLECTOR_DIR} 文件夹`)
    return { success: true, count: result.ok }
  } else if (result.ok > 0) {
    showNote("⚠️ 部分下载失败", `成功 ${result.ok} / ${files.length}`)
    return { success: true, count: result.ok, errors: result.errors }
  } else {
    showNote("❌ 下载失败", result.errors[0] || "请稍后重试")
    return { success: false, errors: result.errors }
  }
}
