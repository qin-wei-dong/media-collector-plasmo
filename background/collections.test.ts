import { beforeEach, describe, expect, it } from "vitest"
import type { Collection, MediaItem } from "../types"
import { COLLECTIONS_KEY, STORAGE_KEY } from "../types"
import { moveCollectionItems } from "./collections"

const collection = (id: string, name = id): Collection => ({
  id,
  name,
  color: "#000",
  createdAt: "2026-06-22T00:00:00Z",
  updatedAt: "2026-06-22T00:00:00Z",
})

const item = (id: string, collectionIds?: string[]): MediaItem => ({
  id,
  url: `https://example.com/${id}.jpg`,
  type: "image",
  platform: "xiaohongshu",
  title: id,
  sourceUrl: "",
  collectedAt: "2026-06-22T00:00:00Z",
  collectionIds,
})

const seed = (collections: Collection[], items: MediaItem[]) => {
  ;(globalThis as any).chrome.storage.local.set({
    [COLLECTIONS_KEY]: collections,
    [STORAGE_KEY]: items,
  })
}

const readItems = (): MediaItem[] =>
  (((globalThis as any).__getChromeStorageMockData()[STORAGE_KEY] as MediaItem[]) || [])

beforeEach(() => {
  ;(globalThis as any).__resetChromeStorageMock()
})

describe("moveCollectionItems", () => {
  it("普通 A -> B:从源移除并加入目标", async () => {
    seed([collection("A"), collection("B")], [item("i1", ["A"])])

    const result = await moveCollectionItems(["i1"], "A", "B")

    expect(result).toEqual({ success: true, movedCount: 1 })
    expect(readItems()[0].collectionIds).toEqual(["B"])
  })

  it("已属于 B 的 A -> B:目标 id 不重复", async () => {
    seed([collection("A"), collection("B")], [item("i1", ["A", "B"])])

    const result = await moveCollectionItems(["i1"], "A", "B")

    expect(result).toEqual({ success: true, movedCount: 1 })
    expect(readItems()[0].collectionIds).toEqual(["B"])
  })

  it("from/to 相同:拒绝移动且不写坏数据", async () => {
    seed([collection("A")], [item("i1", ["A"])])

    const result = await moveCollectionItems(["i1"], "A", "A")

    expect(result).toEqual({ success: false, error: "源收藏夹与目标收藏夹相同" })
    expect(readItems()[0].collectionIds).toEqual(["A"])
  })

  it("目标收藏夹不存在:返回错误且数据不变", async () => {
    seed([collection("A")], [item("i1", ["A"])])

    const result = await moveCollectionItems(["i1"], "A", "B")

    expect(result).toEqual({ success: false, error: "目标收藏夹不存在" })
    expect(readItems()[0].collectionIds).toEqual(["A"])
  })
})
