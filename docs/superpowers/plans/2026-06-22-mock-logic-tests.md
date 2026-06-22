# mock 类单测(restoreItems/saveItems/getNoteMediaFromState)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用自写 mock harness 给 `restoreItems` / `saveItems` / `getNoteMediaFromState` 补单测,锁住去重保序/按 url 去重/双通路回退行为,零新依赖。

**Architecture:** 全局 `chrome.storage.local` 内存 mock(vitest setupFiles)供 storage 层测试;`getNoteMediaFromState` 用 per-file `localStorage`/`window` mock。纯加测试,运行时行为零变化。

**Tech Stack:** vitest 4.x(node environment)、TypeScript(strict)、自写 mock(不引 jsdom/sinon-chrome)。

**Spec:** `docs/superpowers/specs/2026-06-22-mock-logic-tests-design.md`

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `scripts/test/setup-chrome-storage.ts` | Create | 全局 `chrome.storage.local` 内存 mock + reset/read helpers |
| `vitest.config.ts` | Modify | 加 `test.setupFiles` |
| `background/storage.test.ts` | Create | `restoreItems` + `saveItems` 测试(用 chrome mock) |
| `lib/xhs-image-extractor.test.ts` | Create | `getNoteMediaFromState` 测试(per-file localStorage/window mock) |

---

## Task 1: chrome.storage mock harness + vitest setupFiles

**Files:**
- Create: `scripts/test/setup-chrome-storage.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: 创建 `scripts/test/setup-chrome-storage.ts`**

```ts
// scripts/test/setup-chrome-storage.ts — vitest 全局 chrome.storage.local mock
// 内存实现 storage.ts 用到的 chrome.storage.local.get/set + chrome.runtime.lastError。
// 每个 it 通过 __resetChromeStorageMock()(beforeEach 调)清空 store 做隔离。
// __getChromeStorageMockData() 供测试同步读回 store 验证顺序/去重。

let store: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    local: {
      // storage.ts 只用到 get(stringKey, cb) 形态
      get: (key: string, cb: (result: Record<string, unknown>) => void) => {
        cb({ [key]: store[key] })
      },
      set: (obj: Record<string, unknown>, cb?: () => void) => {
        Object.assign(store, obj)
        cb?.()
      },
    },
  },
  runtime: {
    lastError: undefined as string | undefined,
  },
}

;(globalThis as any).chrome = chromeMock

// 测试 helpers
;(globalThis as any).__resetChromeStorageMock = () => {
  store = {}
}
;(globalThis as any).__getChromeStorageMockData = () => store
```

- [ ] **Step 2: `vitest.config.ts` 加 setupFiles**

改为:
```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    setupFiles: ["./scripts/test/setup-chrome-storage.ts"],
  },
})
```

- [ ] **Step 3: 验证 setup 加载不破坏现有 32 个测试**

Run:
```bash
pnpm test
```
Expected: 3 test files / 32 tests 仍全绿(setup 注入 globalThis.chrome,但现有测试不碰 chrome API,应无影响)。

- [ ] **Step 4: Commit**

```bash
git add scripts/test/setup-chrome-storage.ts vitest.config.ts
git commit -m "test: chrome.storage.local 内存 mock(vitest setupFiles)"
```

---

## Task 2: storage 层测试(restoreItems + saveItems)

**Files:**
- Create: `background/storage.test.ts`

- [ ] **Step 1: 写测试 `background/storage.test.ts`**

```ts
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
    const toAdd = [item({ id: "n1", url: "u2" }), item({ id: "n2", url: "u3" })]
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: true, added: 2, skipped: 0 })
    expect(readStore().map((i) => i.id)).toEqual(["n1", "n2", "e1"])
  })

  it("部分 url 已存在 → added/skipped 计数", async () => {
    seed([item({ id: "e1", url: "u1" })])
    // u1 已存在,n1(url u1)被去重,只 add n2(url u2)
    const toAdd = [item({ id: "n1", url: "u1" }), item({ id: "n2", url: "u2" })]
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: true, added: 1, skipped: 1 })
    expect(readStore().map((i) => i.id)).toEqual(["n2", "e1"])
  })

  it("全部已存在 → success:false, added:0, skipped:N", async () => {
    seed([item({ id: "e1", url: "u1" })])
    const toAdd = [item({ id: "x1", url: "u1" })] // url u1 已存在
    const r = await saveItems(toAdd)
    expect(r).toEqual({ success: false, added: 0, skipped: 1, error: "已存在" })
    expect(readStore().map((i) => i.id)).toEqual(["e1"])
  })
})
```

- [ ] **Step 2: 跑测试验证 pass**

Run:
```bash
pnpm test background/storage.test.ts
```
Expected: PASS —— restoreItems 4 个 + saveItems 3 个 = 7 个 it 全绿。若有 FAIL,对照 `background/storage.ts` 的 restoreItems/saveItems 实现核实期望。

- [ ] **Step 3: Commit**

```bash
git add background/storage.test.ts
git commit -m "test: restoreItems/saveItems 去重保序边界"
```

---

## Task 3: getNoteMediaFromState 测试(per-file localStorage/window mock)

**Files:**
- Create: `lib/xhs-image-extractor.test.ts`

- [ ] **Step 1: 写测试 `lib/xhs-image-extractor.test.ts`**

```ts
import { beforeEach, describe, expect, it } from "vitest"
import { getNoteMediaFromState } from "./xhs-image-extractor"

const NOTES_KEY = "__mc_notes__"
const STATE_KEY = "__mc_state__"

let ls: Record<string, string>

beforeEach(() => {
  ls = {}
  // getNoteMediaFromState 只读 localStorage.getItem + window.__INITIAL_STATE__
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => ls[k] ?? null,
  }
  ;(globalThis as any).window = { __INITIAL_STATE__: undefined }
})

const setNotes = (cache: Record<string, unknown>) => {
  ls[NOTES_KEY] = JSON.stringify(cache)
}
const setStateLs = (state: unknown) => {
  ls[STATE_KEY] = JSON.stringify(state)
}
const setWindowState = (state: unknown) => {
  ;(globalThis as any).window.__INITIAL_STATE__ = state
}

describe("getNoteMediaFromState", () => {
  const noteId = "abc123def456abc123def45" // 24 hex(匹配 XHS noteId 格式)

  it("通路1 命中(__mc_notes__[noteId]) → 返回 cache, 不查 state", () => {
    const cached = {
      type: "image",
      images: [{ url: "http://x/1.jpg" }],
      videoUrl: null,
      title: "缓存标题",
      author: "缓存作者",
    }
    setNotes({ [noteId]: cached })
    // 即使 state 也有数据,通路1 必须优先
    setWindowState({
      note: { noteDetailMap: { [noteId]: { note: { title: "state标题" } } } },
    })
    expect(getNoteMediaFromState(noteId)).toEqual(cached)
  })

  it("通路1 miss → 通路2 window.__INITIAL_STATE__ 精确匹配(图集)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: "图集笔记",
              user: { nickname: "小红" },
              imageList: [
                {
                  url: "http://x/1.jpg?imageView2/0",
                  infoList: [{ url: "http://x/1.jpg", width: 100, height: 200 }],
                },
              ],
            },
          },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.type).toBe("image")
    expect(r?.title).toBe("图集笔记")
    expect(r?.author).toBe("小红")
    expect(r?.images).toHaveLength(1)
    expect(r?.images[0].url).toBe("http://x/1.jpg") // 去掉 ?imageView2 后缀
    expect(r?.images[0].width).toBe(100)
    expect(r?.videoUrl).toBeNull()
  })

  it("通路1 miss → 通路2 localStorage.__mc_state__ 兜底(无 window state)", () => {
    setNotes({})
    // window.__INITIAL_STATE__ 保持 undefined
    setStateLs({
      note: {
        noteDetailMap: {
          [noteId]: { note: { title: "ls state 标题", imageList: [{ url: "http://x/2.jpg" }] } },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.title).toBe("ls state 标题")
    expect(r?.images[0].url).toBe("http://x/2.jpg")
  })

  it("单条兜底(map 只 1 条, noteId 不符仍取)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          someOtherId: { note: { title: "唯一笔记", imageList: [{ url: "http://x/3.jpg" }] } },
        },
      },
    })
    const r = getNoteMediaFromState(noteId) // noteId 不匹配,但 map 只 1 条 → 兜底
    expect(r?.title).toBe("唯一笔记")
  })

  it("多笔记 noteId 不匹配 → null(不猜测, 坑1 命脉)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          idA: { note: { title: "A", imageList: [{ url: "http://x/a.jpg" }] } },
          idB: { note: { title: "B", imageList: [{ url: "http://x/b.jpg" }] } },
        },
      },
    })
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })

  it("视频笔记: videoUrl 提取, type=video", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: "视频笔记",
              user: { nickname: "up主" },
              video: {
                media: { stream: { h264: [{ masterUrl: "http://x/v.mp4" }] } },
              },
            },
          },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.type).toBe("video")
    expect(r?.videoUrl).toBe("http://x/v.mp4")
    expect(r?.images).toEqual([])
    expect(r?.author).toBe("up主")
    // coverUrl 经 extractCoverUrlFromVideoObj 递归 scoreCoverUrl 提取,这里只验证非空
    expect(typeof r?.coverUrl).toBe("string")
    expect((r?.coverUrl || "").length).toBeGreaterThan(0)
  })

  it("全 miss(无 notes, window state map 空) → null", () => {
    setNotes({})
    setWindowState({ note: { noteDetailMap: {} } })
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })

  it("__mc_state__ 为非法 JSON → 不抛, 回退 null(getState try/catch)", () => {
    setNotes({})
    ls[STATE_KEY] = "{invalid json"
    // window 无 state → getState 走 localStorage,JSON.parse 抛 → catch → null
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试验证 pass**

Run:
```bash
pnpm test lib/xhs-image-extractor.test.ts
```
Expected: PASS —— 8 个 it 全绿。若有 FAIL,对照 `lib/xhs-image-extractor.ts` 的 `getNoteMediaFromState` / `getState` / `extractUrlFromVideoObj` 实现核实期望。特别注意"多笔记不猜测"和"单条兜底"两个用例,它们是 LESSONS 坑1 的命脉。

- [ ] **Step 3: Commit**

```bash
git add lib/xhs-image-extractor.test.ts
git commit -m "test: getNoteMediaFromState 双通路回退边界"
```

---

## Task 4: 最终全量验证

**Files:** 无(纯验证)

- [ ] **Step 1: 全套测试**

Run:
```bash
pnpm test
```
Expected: 全绿。应有 5 个 test files / 共 32 + 7 + 8 = 47 个 tests passed:
- `background/download.test.ts`(6)
- `background/storage.test.ts`(7) ← 本轮新增
- `lib/export-path.test.ts`(21)
- `lib/design-tokens.test.ts`(5)
- `lib/xhs-image-extractor.test.ts`(8) ← 本轮新增

- [ ] **Step 2: 类型 + 构建零回归**

Run:
```bash
pnpm exec tsc --noEmit && pnpm build
```
Expected: tsc 0 错误 + `plasmo build` DONE。

- [ ] **Step 3: 确认 setup 不污染既有测试**

确认 Step 1 的 32 个既有测试仍全绿(setup 注入 globalThis.chrome 未影响 download/export-path/design-tokens 三个不碰 chrome API 的文件)。若既有测试 FAIL,说明 setup 有副作用,需回 Task 1 修。

(本 task 无 commit —— 纯验证 Task 1-3 的整体结果。)

---

## Self-Review(plan 写完后自检)

- **Spec 覆盖**:spec §3.1 chrome.storage mock → Task 1 ✅;§3.2 localStorage/window mock → Task 3 beforeEach ✅;§4.1 restoreItems(空/全新/部分/保序) → Task 2 ✅;§4.2 saveItems(全新/部分/全存在) → Task 2 ✅;§4.3 getNoteMediaFromState(通路1/通路2精确/ls兜底/单条/多笔记不猜测/视频/图集/全miss) → Task 3 ✅(图集含在"通路2精确匹配"用例);§5 文件组织 → 各 Task ✅;§6 验证 → Task 4 ✅;§7 风险(chrome mock 语义/getState try-catch/setup 不污染) → Task 1 Step 3 + Task 3 非法 JSON 用例 + Task 4 Step 3 分别覆盖 ✅。
- **占位符**:无 TBD/TODO,每步含完整代码或确切命令。
- **类型一致**:`STORAGE_KEY` / `MediaItem` / `XHSNoteMedia` 字段一致;chrome mock get/set 签名匹配 storage.ts 调用(`get(STORAGE_KEY, cb)` / `set({[KEY]: items}, cb)`)。
