# LibraryPage 拆分 — 批 3:hooks 抽出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `LibraryPage` 的 state/useMemo/handlers 抽到 6 个 custom hooks(`lib/hooks/`),LibraryPage 降到 ~400 行布局编排。纯重构,UI 零变化。

**Architecture:** 按依赖层增量抽 hooks(数据层 → 派生 → 聚合 → 筛选 → 选择),每 task 抽 1-2 hooks + LibraryPage 删对应逻辑改调 hook。state 仍 useState(各 hook 持有),LibraryPage 协调 UI 态 + 业务 handler。零行为变化,47 测试回归保护。

**Tech Stack:** TypeScript(strict)、React hooks(`useState`/`useMemo`/`useEffect`/`useCallback`)、Plasmo。

**Spec:** `docs/superpowers/specs/2026-06-22-library-page-split-design.md` §5(批 3)

**关键约束**:每 task 后 `pnpm exec tsc --noEmit` + `pnpm build` + `pnpm test`(47)必须全过 —— hooks 依赖链断会立即被 tsc 捕获。

---

## File Structure

| 新文件 | 职责 | 持有 state | 计算(useMemo) |
|---|---|---|---|
| `lib/hooks/useLibraryData.ts` | 数据加载 | items, collections, history | failedHistoryCount |
| `lib/hooks/useSortedCollections.ts` | 收藏夹排序 | — | sortedCollections |
| `lib/hooks/useEnrichedItems.ts` | 派生基础字段 | — | enrichedItems |
| `lib/hooks/useStats.ts` | 看板聚合 | — | authors, stats, sidebarCounts, collectionCounts, noteImageCounts |
| `lib/hooks/useFilteredItems.ts` | 筛选+排序+分桶+渐进渲染 | renderLimit | filteredItems, sortedItems, buckets, visibleItems, visibleBuckets |
| `lib/hooks/useSelection.ts` | 选择 + 清理 | selectedIds | selectedItems, selectedCount, allCurrentSelected |

**LibraryPage 保留**:state(search/scope/collectionFilter/platformFilter/typeFilter/viewMode/sortDesc/previewItem/notice/dialog/showHistory/batchDownloading) + 业务 handler(downloadItems/removeSelected/openSource/收藏夹 CRUD/键盘) + useMemo(pageTitle/previewSiblings/noMatchDesc) + injectLibraryStyles useEffect。

**依赖顺序**(task 顺序):Task1(数据层) → Task2(派生) → Task3(聚合) → Task4(筛选) → Task5(选择)。后抽的 hook 入参用前抽 hook 的出参。

---

## Task 1: useLibraryData + useSortedCollections(数据层)

**Files:**
- Create: `lib/hooks/useLibraryData.ts`, `lib/hooks/useSortedCollections.ts`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `lib/hooks/useLibraryData.ts`**
从 library.tsx 迁移:items/collections/history 三个 useState + loadItems/loadCollections/loadHistory 三个 useCallback + 初始化 useEffect + failedHistoryCount useMemo。接口:
```ts
import { useCallback, useEffect, useMemo, useState } from "react"
import type { Collection, ExportHistoryEntry, MediaItem } from "../../types"

export function useLibraryData() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [history, setHistory] = useState<ExportHistoryEntry[]>([])

  // loadHistory / loadItems / loadCollections:从 library.tsx 逐字迁移(含 SW 休眠重试逻辑)
  const loadHistory = useCallback(...)  // 迁移 library.tsx 原 loadHistory
  const loadItems = useCallback(...)    // 迁移原 loadItems
  const loadCollections = useCallback(...)  // 迁移原 loadCollections

  // 初始化 useEffect(loadItems/loadCollections/loadHistory),deps [loadItems,loadCollections,loadHistory]
  useEffect(...)

  const failedHistoryCount = useMemo(
    () => history.reduce((sum, h) => sum + (h.failedCount || 0), 0),
    [history]
  )

  return { items, collections, history, failedHistoryCount, setItems, setCollections, loadItems, loadCollections, loadHistory }
}
```
**迁移动作:** Read library.tsx 的 items/collections/history useState(约 L84-86)+ loadItems/loadCollections/loadHistory(L100-154)+ 初始化 useEffect(L156-160)+ failedHistoryCount(L111-114),整段迁移。**setItems/setCollections 必须 export**(业务 handler removeSelected/createCollection 等要用)。

- [ ] **Step 2: 创建 `lib/hooks/useSortedCollections.ts`**
```ts
import { useMemo } from "react"
import type { Collection } from "../../types"

export function useSortedCollections(collections: Collection[]) {
  const sortedCollections = useMemo(() => {
    return [...collections].sort((a, b) => {
      const aPinned = a.pinned ?? false
      const bPinned = b.pinned ?? false
      if (aPinned !== bPinned) return aPinned ? -1 : 1
      const aOrder = a.sortOrder ?? 0
      const bOrder = b.sortOrder ?? 0
      if (aOrder !== bOrder) return aOrder - bOrder
      return +new Date(b.createdAt) - +new Date(a.createdAt)
    })
  }, [collections])
  return { sortedCollections }
}
```
(从 library.tsx L278-288 逐字迁移 useMemo)

- [ ] **Step 3: `tabs/library.tsx` 调 hooks + 删原逻辑**
- 加 import:`import { useLibraryData } from "../lib/hooks/useLibraryData"` + `import { useSortedCollections } from "../lib/hooks/useSortedCollections"`
- LibraryPage 顶部加:
  ```ts
  const { items, collections, history, failedHistoryCount, setItems, setCollections, loadItems, loadCollections, loadHistory } = useLibraryData()
  const { sortedCollections } = useSortedCollections(collections)
  ```
- 删 library.tsx 的:items/collections/history useState、loadItems/loadCollections/loadHistory、初始化 useEffect、failedHistoryCount useMemo、sortedCollections useMemo

- [ ] **Step 4: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误(setItems/setCollections 未用或 loadFns 未用会报 — 确认所有引用改对)
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 5: Commit**
```bash
git add lib/hooks/useLibraryData.ts lib/hooks/useSortedCollections.ts tabs/library.tsx
git commit -m "refactor: useLibraryData/useSortedCollections 抽到 hooks(批3-1)"
```
(中文 + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer)

---

## Task 2: useEnrichedItems(派生基础)

**Files:**
- Create: `lib/hooks/useEnrichedItems.ts`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `lib/hooks/useEnrichedItems.ts`**
```ts
import { useMemo } from "react"
import type { MediaItem } from "../../types"
// EnrichedItem 类型:从 library.tsx 顶部迁出(L13 附近),或在此定义 + export
export type EnrichedItem = MediaItem & {
  _collectedAtMs: number
  _timeBucket: string
  _searchHaystack: string
}
import { getTimeBucket } from "../design-tokens"

export function useEnrichedItems(items: MediaItem[]) {
  const enrichedItems = useMemo<EnrichedItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        _collectedAtMs: +new Date(item.collectedAt),
        _timeBucket: getTimeBucket(item.collectedAt),
        _searchHaystack: `${item.title || ""} ${item.author || ""}`.toLowerCase(),
      })),
    [items]
  )
  return { enrichedItems }
}
```
**迁移动作:** Read library.tsx 的 EnrichedItem 类型(L13)+ enrichedItems useMemo(L268-275),迁移。EnrichedItem 类型从此文件 export(library.tsx 及下游 hooks import)。

- [ ] **Step 2: `tabs/library.tsx` 调 hook + 删原逻辑**
- 加 import:`import { useEnrichedItems, type EnrichedItem } from "../lib/hooks/useEnrichedItems"`
- LibraryPage 加:`const { enrichedItems } = useEnrichedItems(items)`
- 删 library.tsx 的 EnrichedItem 类型定义 + enrichedItems useMemo

- [ ] **Step 3: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误(下游 useMemo 用 enrichedItems 要确认引用 hook 返回值)
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 4: Commit**
```bash
git add lib/hooks/useEnrichedItems.ts tabs/library.tsx
git commit -m "refactor: useEnrichedItems 抽到 hooks(批3-2)"
```

---

## Task 3: useStats(看板聚合)

**Files:**
- Create: `lib/hooks/useStats.ts`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `lib/hooks/useStats.ts`**
从 library.tsx 迁移:authors/stats/sidebarCounts/collectionCounts/noteImageCounts 5 个 useMemo。接口:
```ts
import { useMemo } from "react"
import type { Collection, MediaItem } from "../../types"
import type { EnrichedItem } from "./useEnrichedItems"

export function useStats(items: MediaItem[], collections: Collection[], enrichedItems: EnrichedItem[]) {
  // authors useMemo:从 library.tsx L290-301 迁移(deps [enrichedItems])
  const authors = useMemo(...)
  // stats useMemo:L303-337(deps [items, authors])
  const stats = useMemo(...)
  // sidebarCounts:L339-346(deps [enrichedItems])
  const sidebarCounts = useMemo(...)
  // collectionCounts:L348-356(deps [items])
  const collectionCounts = useMemo(...)
  // noteImageCounts:L358-364(deps [items])
  const noteImageCounts = useMemo(...)
  return { authors, stats, sidebarCounts, collectionCounts, noteImageCounts }
}
```
**迁移动作:** Read library.tsx L290-364 的 5 个 useMemo,整段迁移(含内部逻辑,deps 数组保留)。注意 stats 依赖 authors(本 hook 内)。

- [ ] **Step 2: `tabs/library.tsx` 调 hook + 删原逻辑**
- 加 import:`import { useStats } from "../lib/hooks/useStats"`
- LibraryPage 加:`const { authors, stats, sidebarCounts, collectionCounts, noteImageCounts } = useStats(items, collections, enrichedItems)`
- 删 library.tsx 的 5 个 useMemo(authors/stats/sidebarCounts/collectionCounts/noteImageCounts)

- [ ] **Step 3: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 4: Commit**
```bash
git add lib/hooks/useStats.ts tabs/library.tsx
git commit -m "refactor: useStats 抽到 hooks(批3-3)"
```

---

## Task 4: useFilteredItems(筛选+排序+分桶+渐进渲染)

**Files:**
- Create: `lib/hooks/useFilteredItems.ts`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `lib/hooks/useFilteredItems.ts`**
从 library.tsx 迁移:renderLimit state + filteredItems/sortedItems/buckets/visibleItems/visibleBuckets 5 useMemo + 重置 renderLimit useEffect + loadMore。接口:
```ts
import { useEffect, useMemo, useState } from "react"
import type { EnrichedItem } from "./useEnrichedItems"
import { INITIAL_RENDER_COUNT, RENDER_INCREMENT } from "../../types"  // 或从 library.tsx 迁常量

export interface FilterState {
  search: string
  scope: "all" | "recent" | "uncategorized"
  collectionFilter: string
  platformFilter: string
  typeFilter: string
}

export function useFilteredItems(
  enrichedItems: EnrichedItem[],
  filters: FilterState,
  sortDesc: boolean
) {
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)

  // filteredItems:library.tsx L366-378(deps [collectionFilter, enrichedItems, platformFilter, scope, search, typeFilter])
  const filteredItems = useMemo(...)
  // sortedItems:L380-386(deps [filteredItems, sortDesc])
  const sortedItems = useMemo(...)
  // buckets:L388-397(deps [sortedItems])
  const buckets = useMemo(...)
  // visibleItems:L400(deps [sortedItems, renderLimit])
  const visibleItems = useMemo(...)
  // visibleBuckets:L401-410(deps [visibleItems])
  const visibleBuckets = useMemo(...)

  // 筛选/排序变化重置 renderLimit:L413-415(deps [search, scope, collectionFilter, platformFilter, typeFilter, sortDesc])
  useEffect(() => { setRenderLimit(INITIAL_RENDER_COUNT) }, [filters.search, filters.scope, filters.collectionFilter, filters.platformFilter, filters.typeFilter, sortDesc])

  // loadMore:给 JSX onScroll/loadMore 按钮(L959-960, L1042-1043)用
  const loadMore = useMemo(
    () => () => setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length)),
    [sortedItems.length]
  )

  return { filteredItems, sortedItems, buckets, visibleItems, visibleBuckets, renderLimit, loadMore }
}
```
**迁移动作:** Read library.tsx L366-415 的 useMemo + useEffect,迁移。注意:原 filteredItems deps 用 scope/collectionFilter 等(现在从 filters 入参解构,deps 改 filters.xxx)。INITIAL_RENDER_COUNT/RENDER_INCREMENT 常量从 library.tsx 顶部迁(或从 types.ts import — 它们当前在 library.tsx 顶部,迁到 hook 文件或 types.ts)。

**注意**:原 viewMode 在重置 renderLimit useEffect deps 里(L415),但 viewMode 不影响筛选,保留 viewMode 入参 + deps(或评估去掉)。

- [ ] **Step 2: `tabs/library.tsx` 调 hook + 删原逻辑**
- 加 import:`import { useFilteredItems } from "../lib/hooks/useFilteredItems"`
- LibraryPage 加:
  ```ts
  const { filteredItems, sortedItems, buckets, visibleItems, visibleBuckets, renderLimit, loadMore } = useFilteredItems(enrichedItems, { search, scope, collectionFilter, platformFilter, typeFilter }, sortDesc)
  ```
- 删 library.tsx 的:renderLimit state + 5 useMemo + 重置 useEffect + INITIAL_RENDER_COUNT/RENDER_INCREMENT 常量(若迁 hook)
- **JSX 改动**:onScroll(L959-960)`setRenderLimit((n) => Math.min(...))` 改 `loadMore()`;loadMore 按钮(L1042-1043)`onClick={() => setRenderLimit(...)}` 改 `onClick={loadMore}`

- [ ] **Step 3: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 4: Commit**
```bash
git add lib/hooks/useFilteredItems.ts tabs/library.tsx
git commit -m "refactor: useFilteredItems 抽到 hooks(批3-4)"
```

---

## Task 5: useSelection(选择 + 清理)

**Files:**
- Create: `lib/hooks/useSelection.ts`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `lib/hooks/useSelection.ts`**
从 library.tsx 迁移:selectedIds state + selectedItems/selectedCount/allCurrentSelected + toggleItem/toggleSelectAll/clearSelection + 两个清理 useEffect。接口:
```ts
import { useEffect, useMemo, useState } from "react"
import type { MediaItem } from "../../types"
import type { EnrichedItem } from "./useEnrichedItems"

export interface SelectionFilters {
  scope: string
  platformFilter: string
  collectionFilter: string
  typeFilter: string
  search: string
}

export function useSelection(items: MediaItem[], sortedItems: EnrichedItem[], filters: SelectionFilters) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // selectedItems:L417(deps [items, selectedIds])
  const selectedItems = useMemo(() => items.filter((item) => selectedIds.has(item.id)), [items, selectedIds])
  const selectedCount = selectedItems.length
  const allCurrentSelected = sortedItems.length > 0 && sortedItems.every((item) => selectedIds.has(item.id))

  // 筛选变化清空:L250-252(deps [scope, platformFilter, collectionFilter, typeFilter, search])
  useEffect(() => {
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [filters.scope, filters.platformFilter, filters.collectionFilter, filters.typeFilter, filters.search])

  // items 变化清理 stale id:L257-264(deps [items])
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev
      const validIds = new Set(items.map((item) => item.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [items])

  // toggleItem:L480-487 / toggleSelectAll:L489-498(用 sortedItems) / clearSelection:L500
  const toggleItem = (item: MediaItem) => { setSelectedIds(...) }
  const toggleSelectAll = () => { setSelectedIds(...) /* 用 sortedItems */ }
  const clearSelection = () => setSelectedIds(new Set())

  return { selectedIds, selectedItems, selectedCount, allCurrentSelected, toggleItem, toggleSelectAll, clearSelection }
}
```
**迁移动作:** Read library.tsx L250-264(两 useEffect)+ L417-421(selectedItems/selectedCount/allCurrentSelected)+ L480-500(toggleItem/toggleSelectAll/clearSelection),整段迁移。selectedIds state 迁入。

- [ ] **Step 2: `tabs/library.tsx` 调 hook + 删原逻辑**
- 加 import:`import { useSelection } from "../lib/hooks/useSelection"`
- LibraryPage 加:
  ```ts
  const { selectedIds, selectedItems, selectedCount, allCurrentSelected, toggleItem, toggleSelectAll, clearSelection } = useSelection(items, sortedItems, { scope, platformFilter, collectionFilter, typeFilter, search })
  ```
- 删 library.tsx 的:selectedIds state + selectedItems/selectedCount/allCurrentSelected + toggleItem/toggleSelectAll/clearSelection + 两个清理 useEffect

- [ ] **Step 3: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 4: 手测 UI(用户验证)**
加载扩展,重点测:批量选择(toggle/selectAll)、切换筛选清空选择、删除撤销(走 clearSelection)、导出(走 selectedItems)、键盘快捷键(Cmd+A 全选/Delete 删除/E 导出)。自动化覆盖不到选择交互回归。

- [ ] **Step 5: Commit**
```bash
git add lib/hooks/useSelection.ts tabs/library.tsx
git commit -m "refactor: useSelection 抽到 hooks(批3-5)"
```

---

## Self-Review(plan 写完后自检)

- **Spec 覆盖**:spec §5 的 6 hooks → Task1(useLibraryData+useSortedCollections)/Task2(useEnrichedItems)/Task3(useStats)/Task4(useFilteredItems)/Task5(useSelection)全覆盖 ✅。state 归属(§5.3:items/collections/history/renderLimit/selectedIds 进 hooks,其余留 LibraryPage)✅。handler 归属(§5.4:toggleItem/clearSelection 进 useSelection,业务 handler 留 LibraryPage)✅。
- **占位符**:各 hook 的 useMemo/effect 标"从 library.tsx LXX 迁移"(现有代码迁移指令,非新代码 placeholder)。接口签名 + 入参/出参明确。subagent 执行时 Read 指定行号迁移。
- **类型一致**:`EnrichedItem` Task2 定义 + export,Task3/4/5 import(跨 hook 共享)✅。`FilterState`/`SelectionFilters` 接口 Task4/5 定义 ✅。hook 出参名与 LibraryPage 解构一致。
- **依赖顺序**:Task1(数据层,无依赖)→ Task2(派生,[items])→ Task3(聚合,[items/collections/enrichedItems])→ Task4(筛选,[enrichedItems/filters])→ Task5(选择,[items/sortedItems/filters],sortedItems from Task4)✅。每 task 后 LibraryPage 调已抽 hooks + 剩余内联,tsc 兜底。
- **风险点**:Task4 的 filteredItems deps 从解构 filters 入参(原是独立变量),需逐个对应;Task5 的 toggleSelectAll 用 sortedItems(从 useFilteredItems 出参传入);JSX onScroll/loadMore 改 loadMore()(Task4)。

---

## 后续

批 3 完成后(5 task),LibraryPage 降到 ~400 行(布局编排 + UI 态 + 业务 handler + JSX)。整个 LibraryPage 拆分(批1+2+3)完成。合并 main + 手测全流程。
