import { describe, expect, it } from "vitest"
import type { Collection, MediaItem } from "../types"
import {
  buildExportFilename,
  buildExportPath,
  type ExportContext,
  resolveExportFolder,
  sanitizePathSegment,
  summarizeExportFolders,
} from "./export-path"

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "1",
  url: "http://x/img.jpg",
  type: "image",
  platform: "xiaohongshu",
  title: "标题",
  sourceUrl: "",
  collectedAt: "2026-06-22T00:00:00Z",
  ...over,
})

const coll = (id: string, name: string): Collection => ({
  id,
  name,
  color: "#000",
  createdAt: "",
  updatedAt: "",
})

const ctx = (over: Partial<ExportContext> = {}): ExportContext => ({
  collectionFilter: "",
  collections: [],
  ...over,
})

describe("sanitizePathSegment", () => {
  it("替换非法字符为 -", () => {
    expect(sanitizePathSegment("a/b?c*d:e", "x")).toBe("a-b-c-d-e")
  })
  it("折叠空白并 trim", () => {
    expect(sanitizePathSegment("  a   b  ", "x")).toBe("a b")
  })
  it("截断到 50 字符", () => {
    expect(sanitizePathSegment("啊".repeat(60), "x").length).toBe(50)
  })
  it("空 / . / .. / undefined 回退 fallback", () => {
    expect(sanitizePathSegment("", "fb")).toBe("fb")
    expect(sanitizePathSegment(".", "fb")).toBe("fb")
    expect(sanitizePathSegment("..", "fb")).toBe("fb")
    expect(sanitizePathSegment(undefined, "fb")).toBe("fb")
  })
  it("正常值原样保留", () => {
    expect(sanitizePathSegment("小红书笔记", "x")).toBe("小红书笔记")
  })
})

describe("resolveExportFolder", () => {
  it("collectionFilter 命中 → 该收藏夹名", () => {
    const c = ctx({ collectionFilter: "c1", collections: [coll("c1", "灵感")] })
    expect(resolveExportFolder(item(), c)).toBe("灵感")
  })
  it("collectionFilter 命中但收藏夹名需净化", () => {
    const c = ctx({ collectionFilter: "c1", collections: [coll("c1", "a/b")] })
    expect(resolveExportFolder(item(), c)).toBe("a-b")
  })
  it("collectionIds 按 collections 顺序首个匹配(非 ids 顺序)", () => {
    const c = ctx({ collections: [coll("c2", "B"), coll("c1", "A")] })
    // collections 里 c2 在前,虽然 ids 里 c1 在前,仍返回 B
    expect(resolveExportFolder(item({ collectionIds: ["c1", "c2"] }), c)).toBe("B")
  })
  it("collectionIds 无任何 collection 匹配 → 落到作者", () => {
    const c = ctx({ collections: [] })
    expect(resolveExportFolder(item({ collectionIds: ["c9"], author: "张三" }), c)).toBe("张三")
  })
  it("无收藏夹 → 作者", () => {
    expect(resolveExportFolder(item({ author: "张三" }), ctx())).toBe("张三")
  })
  it("全无 → 未分类", () => {
    expect(resolveExportFolder(item(), ctx())).toBe("未分类")
  })
})

describe("buildExportFilename", () => {
  it("image → jpg", () => {
    expect(buildExportFilename(item({ type: "image" }))).toBe("标题.jpg")
  })
  it("video → mp4", () => {
    expect(buildExportFilename(item({ type: "video" }))).toBe("标题.mp4")
  })
  it("groupIndex → 两位序号(从 01 起)", () => {
    expect(buildExportFilename(item({ groupIndex: 0 }))).toBe("标题_01.jpg")
    expect(buildExportFilename(item({ groupIndex: 11 }))).toBe("标题_12.jpg")
  })
  it("空标题 → 素材回退", () => {
    expect(buildExportFilename(item({ title: "" }))).toBe("素材.jpg")
  })
  it("标题含非法字符 → 净化", () => {
    expect(buildExportFilename(item({ title: "a/b?c" }))).toBe("a-b-c.jpg")
  })
})

describe("buildExportPath", () => {
  it("folder + filename 拼接", () => {
    const i = item({ author: "张三", groupIndex: 0 })
    expect(buildExportPath(i, ctx())).toBe("张三/标题_01.jpg")
  })
})

describe("summarizeExportFolders", () => {
  it("空数组 → 空串", () => {
    expect(summarizeExportFolders([])).toBe("")
  })
  it("全空字符串 → 空串(filter Boolean)", () => {
    expect(summarizeExportFolders(["", ""])).toBe("")
  })
  it("单个 → 其名", () => {
    expect(summarizeExportFolders(["灵感"])).toBe("灵感")
  })
  it("多个 → 多个文件夹", () => {
    expect(summarizeExportFolders(["a", "b"])).toBe("多个文件夹")
  })
})
