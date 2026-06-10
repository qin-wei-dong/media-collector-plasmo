// background/download.ts — 下载操作


import { showNote } from "./index"
export function downloadSingle(
  url: string,
  filename: string
): Promise<{ success: boolean; downloadId?: number; error?: string }> {
  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url,
        filename: "media-collector/" + (filename || "素材.jpg"),
        saveAs: true,
      },
      (downloadId) => {
        const err = chrome.runtime.lastError
        resolve({ success: !err, downloadId, error: err?.message })
      }
    )
  })
}

export function batchDownload(
  files: { url: string; filename: string }[]
): Promise<{ success: boolean; count?: number; errors?: string[] }> {
  return new Promise((resolve) => {
    if (!files?.length) {
      resolve({ success: false })
      return
    }

    let completed = 0
    const errors: string[] = []

    files.forEach((file) => {
      chrome.downloads.download(
        {
          url: file.url,
          filename: "media-collector/" + (file.filename || "素材"),
          saveAs: false,
        },
        () => {
          const err = chrome.runtime.lastError
          if (err) errors.push(file.filename + ": " + err.message)
          completed++

          if (completed === files.length) {
            if (errors.length === 0) {
              showNote("✅ 批量下载完成", `共 ${files.length} 个文件已保存到 media-collector 文件夹`)
              resolve({ success: true, count: files.length })
            } else if (errors.length < files.length) {
              showNote("⚠️ 部分下载失败", `成功 ${files.length - errors.length} / ${files.length}`)
              resolve({ success: true, count: files.length - errors.length, errors })
            } else {
              showNote("❌ 下载失败", errors[0])
              resolve({ success: false, errors })
            }
          }
        }
      )
    })
  })
}

