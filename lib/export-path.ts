// lib/export-path.ts — 导出路径解析(从 tabs/library.tsx 抽出,便于单测)
import type { Collection, MediaItem } from "../types"

/** 清洗路径段:去掉非法字符,折叠空白,限制长度;空或 `.` / `..` 回退。 */
export function sanitizePathSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
  if (cleaned === "." || cleaned === "..") return fallback
  return cleaned || fallback
}

export interface ExportContext {
  collectionFilter: string
  collections: Collection[]
}

/**
 * 解析素材导出目录(M4 plan 4.1 优先级):
 * 1. 当前正在查看收藏夹 → 该收藏夹名
 * 2. 素材已归属收藏夹 → 按 collections 顺序第一个匹配,否则 collectionIds[0] 对应名
 * 3. 作者
 * 4. “未分类”
 */
export function resolveExportFolder(item: MediaItem, ctx: ExportContext): string {
  const nameById = (id: string) => ctx.collections.find((c) => c.id === id)?.name

  if (ctx.collectionFilter) {
    const name = nameById(ctx.collectionFilter)
    if (name) return sanitizePathSegment(name, "未分类")
  }

  const ids = item.collectionIds || []
  if (ids.length) {
    for (const c of ctx.collections) {
      if (ids.includes(c.id)) return sanitizePathSegment(c.name, "未分类")
    }
    const firstName = nameById(ids[0])
    if (firstName) return sanitizePathSegment(firstName, "未分类")
  }

  if (item.author) return sanitizePathSegment(item.author, "未分类")

  return "未分类"
}

/** 生成文件名(不含目录)。 */
export function buildExportFilename(item: MediaItem): string {
  const ext = item.type === "video" ? "mp4" : "jpg"
  const baseName = sanitizePathSegment(item.title, "素材")
  return item.groupIndex !== undefined
    ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
    : `${baseName}.${ext}`
}

/** 完整相对路径:`<folder>/<filename>`。 */
export function buildExportPath(item: MediaItem, ctx: ExportContext): string {
  return `${resolveExportFolder(item, ctx)}/${buildExportFilename(item)}`
}

/** 汇总目录用于 Toast:无目录返回空串,单个返回其名,多个返回“多个文件夹”。 */
export function summarizeExportFolders(folders: string[]): string {
  const real = folders.filter(Boolean)
  if (real.length === 0) return ""
  if (real.length === 1) return real[0]
  return "多个文件夹"
}
