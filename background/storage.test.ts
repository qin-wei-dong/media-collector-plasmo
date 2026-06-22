import { beforeEach, describe, expect, it } from "vitest"
import { STORAGE_KEY } from "../types"
import type { MediaItem } from "../types"
import { restoreItems, saveItems } from "./storage"

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "id1",
  url: "http://x/a.jpg",
  type: "image",
  platform: "xiaohongshu",
  title: "t",
  sourceUrl: "",
  collectedAt: "2026-06-22T00:00:00Z",
  ...over,
})

// 预置现有数据到 mock store
const seed = (items: MediaItem[]) => {
  ;(globalThis as any).chrome.storage.local.set({ [STORAGE_KEY]: items })
}
// 同步读回 store 的 STORAGE_KEY 项
const readStore = (): MediaItem[] =>
  (((globalThis as any).__getChromeStorageMockData()[STORAGE_KEY] as MediaItem[]) || [])

beforeEach(() => {
  ;(globalThis as any).__resetChromeStorageMock()
})

describe("restoreItems", () => {
  it("空数组 → restored:0, store 不变", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const before = readStore()
    const r = await restoreItems([])
    expect(r).toEqual({ success: true, restored: 0 })
    expect(readStore()).toEqual(before)
  })

  it("全新 id → 插到最前, restored:N", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const toRestore = [item({ id: "n1", url: "u2" }), item({ id: "n2", url: "u3" })]
    const r = await restoreItems(toRestore)
    expect(r).toEqual({ success: true, restored: 2 })
    expect(readStore().map((i) => i.id)).toEqual(["n1", "n2", "e1"])
  })

  it("部分 id 已存在 → 去重(已存在的不重复插)", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const toRestore = [item({ id: "e1", url: "u1" }), item({ id: "n1", url: "u2" })]
    const r = await restoreItems(toRestore)
    expect(r).toEqual({ success: true, restored: 1 })
    expect(readStore().map((i) => i.id)).toEqual(["n1", "e1"])
  })

  it("保留原 collectedAt(撤销后排序不变)", async () => {
    const original = item({ id: "e1", url: "u1", collectedAt: "2026-06-01T00:00:00Z" })
    seed([original])
    // 回传原 item(含原 collectedAt),id 已存在 → 不重复插,但 store 原样保留
    const r = await restoreItems([original])
    expect(r).toEqual({ success: true, restored: 0 })
    expect(readStore()[0].collectedAt).toBe("2026-06-01T00:00:00Z")
  })
})

describe("saveItems", () => {
  it("全新 url → added:N, skipped:0, unshift 最前", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const toAdd = [item({ id: "n1", url: "u2" }), item({ id: "n2", url: "u3" })] as MediaItem[]
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: true, added: 2, skipped: 0 })
    expect(readStore().map((i) => i.id)).toEqual(["n1", "n2", "e1"])
  })

  it("部分 url 已存在 → added/skipped 计数", async () => {
    seed([item({ id: "e1", url: "u1" })])
    // u1 已存在,n1(url u1)被去重,只 add n2(url u2)
    const toAdd = [item({ id: "n1", url: "u1" }), item({ id: "n2", url: "u2" })] as MediaItem[]
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: true, added: 1, skipped: 1 })
    expect(readStore().map((i) => i.id)).toEqual(["n2", "e1"])
  })

  it("全部已存在 → success:false, added:0, skipped:N", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const toAdd = [item({ id: "x1", url: "u1" })] as MediaItem[] // url u1 已存在
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: false, added: 0, skipped: 1, error: "已存在" })
    expect(readStore().map((i) => i.id)).toEqual(["e1"])
  })
})
