// background/download.ts — 下载操作

import { type ExportHistoryEntry, MEDIA_COLLECTOR_DIR, type Platform } from "../types"
import { showNote } from "./notifications"
import { appendExportHistory, markItemsExported } from "./storage"

const DOWNLOAD_TIMEOUT_MESSAGE = "下载超时,请在导出历史中重试"

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

/** 当前公开版只支持小红书素材导出,统一使用小红书 Referer。 */
function refererFor(_platform?: Platform): string {
  return "https://www.xiaohongshu.com/"
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
export function isUnsafePath(filename: string): boolean {
  if (filename.startsWith("/") || filename.startsWith("\\")) return true
  if (/^[a-zA-Z]:[\\/]/.test(filename)) return true // Windows 盘符绝对路径
  return filename.split(/[\\/]/).some((seg) => seg === "." || seg === "..")
}

export function waitForDownloadCompletion(downloadId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = (onChanged: (delta: chrome.downloads.DownloadDelta) => void) => {
      if (timer) clearTimeout(timer)
      chrome.downloads.onChanged.removeListener(onChanged)
    }

    const finish = (onChanged: (delta: chrome.downloads.DownloadDelta) => void, error?: Error) => {
      if (settled) return
      settled = true
      cleanup(onChanged)
      if (error) reject(error)
      else resolve()
    }

    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return
      if (delta.state?.current === "complete") {
        finish(onChanged)
        return
      }
      if (delta.state?.current === "interrupted") {
        finish(onChanged, new Error("下载中断"))
      }
    }

    chrome.downloads.onChanged.addListener(onChanged)

    timer = setTimeout(() => {
      chrome.downloads.search({ id: downloadId }, (items) => {
        const lastError = chrome.runtime.lastError
        if (lastError) {
          finish(onChanged, new Error(lastError.message || DOWNLOAD_TIMEOUT_MESSAGE))
          return
        }

        const state = items?.[0]?.state
        if (state === "complete") {
          finish(onChanged)
        } else if (state === "interrupted") {
          finish(onChanged, new Error("下载中断"))
        } else {
          finish(onChanged, new Error(DOWNLOAD_TIMEOUT_MESSAGE))
        }
      })
    }, timeoutMs)
  })
}

/**
 * 在 background(service worker)中直接 fetch + download。
 * service worker 的 fetch 不带页面 cookie,但小红书 CDN 图片通常不严格校验 cookie,
 * 只需带上 Referer 即可通过防盗链。
 *
 * M4 改造:
 * - 当前公开版统一使用小红书 Referer
 * - filename 可含子目录,最终路径为 `MEDIA_COLLECTOR_DIR/<filename>`
 * - 成功项记录 id 与 folder,下载完成后批量写入 exportedAt
 */
/**
 * 下载单个文件:fetch → blob → dataUrl → chrome.downloads。
 * 支持失败重试(限流场景):首次失败后延迟 1.5s 重试 1 次。
 */
async function downloadOne(file: DownloadFile, index: number): Promise<void> {
  const doFetch = async (): Promise<Blob> => {
    const resp = await fetch(file.url, {
      headers: { Referer: refererFor(file.platform) },
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return resp.blob()
  }

  // 首次尝试;失败则延迟重试 1 次(应对 CDN 限流 429/403)
  let blob: Blob
  try {
    blob = await doFetch()
  } catch (firstErr) {
    await new Promise((r) => setTimeout(r, 1500))
    blob = await doFetch() // 重试失败会抛出,由外层 catch 捕获
  }

  const dataUrl = await blobToDataUrl(blob)

  await new Promise<void>((resolve, reject) => {
    chrome.downloads.download(
      {
        url: dataUrl,
        filename: MEDIA_COLLECTOR_DIR + "/" + (file.filename || `素材_${index + 1}.jpg`),
        saveAs: false,
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (typeof downloadId !== "number") {
          reject(new Error("下载启动失败"))
          return
        }
        waitForDownloadCompletion(downloadId).then(resolve).catch(reject)
      }
    )
  })
}

async function fetchAndDownload(
  files: DownloadFile[]
): Promise<{
  ok: number
  errors: string[]
  exportedIds: string[]
  folders: string[]
  // M6 Task 4:失败文件详情,供历史记录 + 重试
  failedFiles: Array<{ id?: string; url: string; filename: string; platform?: Platform; error: string }>
}> {
  let ok = 0
  const errors: string[] = []
  const successfulIds: string[] = []
  const folders: string[] = []
  const failedFiles: Array<{ id?: string; url: string; filename: string; platform?: Platform; error: string }> = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (isUnsafePath(file.filename)) {
      const msg = `${file.filename}: 非法路径`
      errors.push(msg)
      failedFiles.push({ ...file, error: msg })
      continue
    }
    try {
      await downloadOne(file, i)
      ok++
      if (file.id) successfulIds.push(file.id)
      const folder = extractFolder(file.filename)
      if (folder && !folders.includes(folder)) folders.push(folder)
      // 间隔 800ms,降低 CDN 限流概率(批量下载核心修复)
      await new Promise((r) => setTimeout(r, 800))
    } catch (e: any) {
      const msg = `${file.filename || file.url.slice(-20)}: ${e.message}`
      errors.push(msg)
      failedFiles.push({ ...file, error: e?.message || String(e) })
    }
  }

  // 成功项写入 exportedAt(失败不影响下载流程)
  if (successfulIds.length) {
    try {
      await markItemsExported(successfulIds, new Date().toISOString())
    } catch {
      // 标记失败不阻断下载流程
    }
  }

  return { ok, errors, exportedIds: successfulIds, folders, failedFiles }
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
  history?: ExportHistoryEntry
}> {
  if (!files?.length) return { success: false }

  const result = await fetchAndDownload(files)
  const folder = result.folders.length === 1 ? result.folders[0] : undefined

  // M6 Task 4:写导出历史(任一 batchDownload 完成后,成功/部分失败/全失败 都记录)
  const historyEntry: ExportHistoryEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    total: files.length,
    successCount: result.ok,
    failedCount: result.failedFiles.length,
    folders: result.folders,
    itemIds: result.exportedIds,
    failedFiles: result.failedFiles.length ? result.failedFiles : undefined,
  }
  try {
    await appendExportHistory(historyEntry)
  } catch {
    // 历史写入失败不阻断下载流程
  }

  if (result.errors.length === 0) {
    showNote("✅ 批量下载完成", `共 ${result.ok} 个文件已保存到 ${MEDIA_COLLECTOR_DIR} 文件夹`)
    return {
      success: true,
      count: result.ok,
      folder,
      folders: result.folders,
      exportedIds: result.exportedIds,
      history: historyEntry,
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
      history: historyEntry,
    }
  } else {
    showNote("❌ 下载失败", result.errors[0] || "请稍后重试")
    return { success: false, errors: result.errors, history: historyEntry }
  }
}
