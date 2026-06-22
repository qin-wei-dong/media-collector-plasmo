# 第三阶段设计:mock 类单测(restoreItems / saveItems / getNoteMediaFromState)

**日期**: 2026-06-22
**分支**: `refactor/20260622-mock-tests`
**状态**: 设计已批准,待写实现计划

## 1. 背景与目标

第二阶段给纯函数补了 32 个单测(导出路径 / isUnsafePath / getTimeBucket),但三个**依赖外部环境**的核心运行逻辑仍零覆盖:

- `restoreItems` —— 删除撤销的命脉(按 id 去重 + 保留原 `collectedAt` 保序)
- `saveItems` —— 采集写入(按 url 去重)
- `getNoteMediaFromState` —— 采集数据读取(MAIN world 双通路回退,CLAUDE.md 标注的 load-bearing 代码,LESSONS 坑1 的命脉:多笔记不猜测)

本轮用**自写 mock harness**(零新依赖,不引 jsdom/sinon-chrome)给这三者补单测,锁住行为基线,为后续 `LibraryPage` 拆分补上安全网的最后一块。

## 2. 范围

**In**:
- 自写 `chrome.storage.local` mock(全局 setup)
- 自写 `localStorage` / `window` mock(per-file,仅 getNoteMediaFromState)
- 测 `restoreItems` / `saveItems` / `getNoteMediaFromState`

**Out(YAGNI,留后续)**:
- 不引 jsdom / sinon-chrome / vitest-chrome
- 不测组件渲染、不测 `markItemsExported` / `removeItems` 等(本轮聚焦三函数)
- 不动运行时行为

## 3. mock harness 架构

### 3.1 `chrome.storage.local` mock(全局 setup)

新建 `scripts/test/setup-chrome-storage.ts`,`vitest.config.ts` 加 `test.setupFiles`。内存实现 `chrome.storage.local.get/set` + `chrome.runtime.lastError`,每个 `it` 用 `beforeEach` 清空 store 做隔离。

骨架(`storage.ts` 只用到 `get(stringKey, cb)` / `set(obj, cb)` / `chrome.runtime.lastError`):
```ts
let store: Record<string, unknown> = {}
globalThis.chrome = {
  storage: { local: {
    get: (key: string, cb: (r: Record<string, unknown>) => void) =>
      cb({ [key]: store[key] }),
    set: (obj: Record<string, unknown>, cb?: () => void) => {
      Object.assign(store, obj); cb?.()
    },
  } },
  runtime: { lastError: undefined as string | undefined },
} as any

// 暴露一个 reset hook 供测试 beforeEach 清空
;(globalThis as any).__resetChromeStorageMock = () => { store = {} }
```

### 3.2 `localStorage` / `window` mock(per-file)

`lib/xhs-image-extractor.test.ts` 的 `beforeEach` 注入(`getNoteMediaFromState` 只读 `localStorage.getItem` + `window.__INITIAL_STATE__`):
```ts
const ls: Record<string, string> = {}
beforeEach(() => {
  globalThis.localStorage = { getItem: (k) => ls[k] ?? null } as any
  globalThis.window = { __INITIAL_STATE__: undefined } as any
})
```
测试用例直接往 `ls` 写 `__mc_notes__` / `__mc_state__`,或设 `globalThis.window.__INITIAL_STATE__`。

## 4. 测试清单

### 4.1 `restoreItems`(`background/storage.test.ts`)

实现要点:`if (!items.length) return {success:true, restored:0}`;否则 getItems → `toAdd = items.filter(!existingIds.has(id))` → `merged = [...toAdd, ...existing]` → set → `{success:true, restored: toAdd.length}`。

- 空数组 → `{success:true, restored:0}`,store 不变(提前返回,不读 store)
- 全新 id → 插到列表最前,`restored: N`
- 部分 id 已存在 → 去重,`restored = 新增数`(已存在的不重复插)
- **保留原 `collectedAt`**(撤销后排序与删除前一致 —— 传回的 items 带原 collectedAt,merged 保持)

### 4.2 `saveItems`(同文件)

实现要点:`existingUrls = Set(items.map(url))`;`toAdd = newItems.filter(!existingUrls.has(url))`;`skipped = newItems.length - toAdd.length`;`toAdd.length===0` → `{success:false, added:0, skipped, error:"已存在"}`;否则 `merged = [...toAdd, ...items]` → `{success:true, added, skipped}`。

- 全新 url → `added: N, skipped: 0`,unshift 最前
- 部分 url 已存在 → `added = 新`, `skipped = 已存在数`
- 全部已存在 → `{success:false, added:0, skipped:N, error:"已存在"}`

### 4.3 `getNoteMediaFromState`(`lib/xhs-image-extractor.test.ts`)

实现要点:通路1 `JSON.parse(localStorage.__mc_notes__)[noteId]` → 通路2 `getState()`(`window.__INITIAL_STATE__` → `localStorage.__mc_state__`)`.note.noteDetailMap`;精确匹配 noteId,单条兜底,**多笔记不匹配返回 null**(LESSONS 坑1);视频走 `extractUrlFromVideoObj`,图集走 imageList。

- **通路1 命中**:`__mc_notes__[noteId]` 有 → 返回该 cache(不查 state)
- **通路1 miss → 通路2 精确匹配**:`window.__INITIAL_STATE__.note.noteDetailMap[noteId].note`
- **通路2 localStorage 兜底**:无 window state,`localStorage.__mc_state__` 有 → 用它
- **单条兜底**:map 只 1 条有效、noteId 不符仍取那条
- **多笔记不猜测**:map 多条、noteId 不匹配 → `null`(坑1 命脉)
- **视频笔记**:`entry.video` 有 → `videoUrl` + `coverUrl` 提取,type:"video"
- **图集笔记**:`imageList`/`infoList` 提取 images,type:"image"
- **全 miss**(无 notes、无 state、map 空)→ `null`

## 5. 文件组织 + vitest.config

- `scripts/test/setup-chrome-storage.ts`(全局 chrome mock + reset hook)
- `background/storage.test.ts`(restoreItems + saveItems)
- `lib/xhs-image-extractor.test.ts`(getNoteMediaFromState,per-file localStorage/window mock)
- `vitest.config.ts` 加 `test.setupFiles: ["./scripts/test/setup-chrome-storage.ts"]`

## 6. 验证标准

- `pnpm test` 全绿(32 现有 + 新增 restoreItems/saveItems/getNoteMediaFromState 用例)
- `pnpm exec tsc --noEmit` 0 错误
- `pnpm build` DONE
- 运行时行为零变化(纯加测试)

## 7. 风险

- **中**:chrome.storage mock 的 get/set 语义要匹配 storage.ts 实际调用方式(单 string key + callback)。若 mock 漏了某个调用形态,测试会假绿 —— 对照 storage.ts 的 `getItems` 实现(`chrome.storage.local.get(STORAGE_KEY, cb)`)精确 mock。
- **低**:getNoteMediaFromState 的 localStorage/window mock 只需 getItem + `__INITIAL_STATE__`,但要注意 `getState()` 内 try/catch 兜底(JSON.parse 失败返回 null)—— 测一个 `__mc_state__` 为非法 JSON 的用例,确认不抛。
- **低**:全局 setup 改了 `globalThis.chrome`,要确保不影响第二阶段已有测试(它们不碰 chrome API,应无影响 —— 实施时跑全套确认)。

## 8. 后续批次(本轮不做)

- `markItemsExported` / `removeItems` / `clearItems` 等 storage 层其余函数
- 组件渲染测试(@testing-library/react)
- `LibraryPage` 拆分(测试网补齐后,这是下一阶段的重点)
