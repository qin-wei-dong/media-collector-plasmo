# M6 Task 2+7 大列表渐进渲染 + UX 细节(合并实施)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 500-1000 条素材下,库页打开/搜索/筛选/滚动顺畅,用户清楚"自己看到了多少 / 还有多少",并保留全选当前筛选结果的语义。

**Architecture:** 渐进渲染 + 预计算分桶 + 滚动追加,不自研虚拟滚动。分桶基于完整 `sortedItems`,渲染只切 `visibleItems`,section header 用预计算桶总数。

**Tech Stack:** Plasmo MV3、React 18、TypeScript、现有 `tabs/library.tsx`

---

> **背景**:M6 主计划文件 `2026-06-17-m6-large-library-efficiency-implementation.md` 里 Task 2(渐进渲染)和 Task 7(UX 细节)边界模糊(都提到"显示更多"和"X/N 项"显示),本子计划把它们合并成一个原子任务,避免重复 PR。
>
> **基线**:`main` `ecdb6ae`(`fix(m6.0) + feat(m6.1): 可靠性收口 + 样本数据生成脚本 (#5)`)。M6.0 已合 main,Task 1(样本数据生成脚本)已合 main。

## 1. 目标

- **性能**:500 条素材库页打开后 2 秒内可操作(Chrome 实测)
- **可用性**:用户随时知道"当前显示 X / 共 N 项"
- **正确性**:全选仍以当前筛选结果 `sortedItems` 为准,不降级为 `visibleItems`
- **稳定性**:滚动监听失败时,"显示更多"按钮兜底
- **搜索**:输入态不影响全选/导出/删除(留到 Task 6)

## 2. 非目标

- 不实现虚拟滚动(渐进渲染够用)
- 不改 search/sort/filter 逻辑本身
- 不动预览 modal(同笔记左右切换仍走 `items` / `noteId` 逻辑)
- 不改空状态主结构(只补"当前筛选说明"小尾巴)

## 3. 关键数据流

```
items (raw)
  → filteredItems (search + scope + collection + platform + type)
  → sortedItems (sortDesc 控制)
  → bucketed (完整 sortedItems 分桶)        ← 预计算,用于 section header 的 Y
  → visibleItems (sortedItems.slice(0, renderLimit))
  → visibleBuckets (visibleItems 分桶)      ← 渲染用,X
```

**核心约束:**
- **section header**:`bucket 名 · {bucketAllLength} 项 [+ 已显示 {bucketVisibleLength} / {bucketAllLength}]`
- **全选 / 批量导出**:`sortedItems`(不是 `visibleItems`),否则用户全选后只导出首屏会丢失数据
- **renderLimit 重置时机**:`search / scope / collectionFilter / platformFilter / typeFilter / sortDesc / viewMode` 任一变化时

## 4. 实施任务

### Task 2.1:状态与常量

**文件**:`tabs/library.tsx`

- [ ] 文件顶部新增常量:

```ts
// M6 Task 2+7:渐进渲染配置
const INITIAL_RENDER_COUNT = 160
const RENDER_INCREMENT = 120
const SCROLL_BOTTOM_THRESHOLD = 480  // px,滚动距底部 < 此值时触发追加
```

- [ ] 在 `LibraryPage` 内新增 state:

```ts
const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)
```

**验收**:
- 文件可被 TS 编译通过(`pnpm build`)
- 常量值与 M6 计划对齐

### Task 2.2:派生数据 useMemo

**文件**:`tabs/library.tsx`

- [ ] 在 `sortedItems` 之后(已存在的 useMemo)新增:

```ts
// 完整 sortedItems 的分桶(用于 section header 的 Y)
const bucketed = useMemo(() => {
  const map = new Map<string, MediaItem[]>()
  for (const item of sortedItems) {
    const bucket = getTimeBucket(item.collectedAt)
    const arr = map.get(bucket)
    if (arr) arr.push(item)
    else map.set(bucket, [item])
  }
  return map
}, [sortedItems])

// 当前 visibleItems(渲染用)
const visibleItems = useMemo(
  () => sortedItems.slice(0, renderLimit),
  [sortedItems, renderLimit]
)

// visibleItems 的分桶(渲染时遍历用)
const visibleBuckets = useMemo(() => {
  const map = new Map<string, MediaItem[]>()
  for (const item of visibleItems) {
    const bucket = getTimeBucket(item.collectedAt)
    const arr = map.get(bucket)
    if (arr) arr.push(item)
    else map.set(bucket, [item])
  }
  return map
}, [visibleItems])
```

- [ ] `bucketed` 取代原 `buckets` useMemo(若有)。**保留旧的 `buckets` 别名 = `bucketed` 暂存**,待所有引用替换后再删除。

**验收**:
- 编译通过
- React DevTools 验证:`bucketed` 在 `sortedItems` 不变时引用稳定

### Task 2.3:renderLimit 重置

**文件**:`tabs/library.tsx`

- [ ] 在所有 useMemo 之后,新增:

```ts
// 筛选/搜索/排序/视图变化时重置 renderLimit(从头开始)
useEffect(() => {
  setRenderLimit(INITIAL_RENDER_COUNT)
}, [search, scope, collectionFilter, platformFilter, typeFilter, sortDesc, viewMode])
```

- [ ] 在依赖列表里确认 7 个 trigger 都覆盖。

**验收**:
- 切换平台 chip,renderLimit 立即回到 160
- 搜索输入变化,renderLimit 回到 160
- 视图模式 grid↔list 切换,renderLimit 回到 160

### Task 2.4:滚动监听

**文件**:`tabs/library.tsx`

- [ ] 给滚动容器加 `onScroll` 处理器:

```tsx
<section
  className="mc-library-scroll"
  style={styles.content}
  onScroll={(e) => {
    const el = e.currentTarget
    // 滚动接近底部时追加渲染
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_BOTTOM_THRESHOLD) {
      setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length))
    }
  }}
>
```

- [ ] 滚动事件用 React 合成事件即可,不要 `addEventListener`(避免 cleanup 漏掉)。
- [ ] 节流:用 `Math.min` 自然去重 — 同一帧多次触发只追加一次。

**验收**:
- 500 条时滚到底自动追加到 280 → 400 → 520(略大于 500,受 RENDER_INCREMENT 控制)
- 1000 条时可滚到底
- 滚动到中途反向滚回顶部,renderLimit 不变(已加载项不卸载)

### Task 2.5:section header 显示

**文件**:`tabs/library.tsx`

- [ ] 替换 grid 视图的 map:

```tsx
{TIME_ORDER.filter((bucket) => bucketed.get(bucket)?.length).map((bucket) => {
  const allInBucket = bucketed.get(bucket)!.length
  const visibleInBucket = visibleBuckets.get(bucket) || []
  return (
    <div key={bucket} style={styles.timeSection}>
      <div style={styles.sectionTitle}>
        <span>{bucket} · {allInBucket} 项</span>
        {visibleInBucket.length < allInBucket && (
          <span style={styles.sectionPartial}>
            已显示 {visibleInBucket.length} / {allInBucket}
          </span>
        )}
      </div>
      <div style={styles.grid}>
        {visibleInBucket.map((item) => (
          <LibraryCell
            key={item.id}
            item={item}
            selected={selectedIds.has(item.id)}
            imageCount={item.noteId ? noteImageCounts.get(item.noteId) : undefined}
            onPreview={() => setPreviewItem(item)}
            onToggleSelect={() => toggleItem(item)}
            onDownload={() => downloadItems([item])}
            onOpenSource={() => openSource(item)}
          />
        ))}
      </div>
    </div>
  )
})}
```

- [ ] 列表视图同样替换:`sortedItems.map` → `visibleItems.map`。

- [ ] 关键不变量:
  - `allInBucket` 始终来自 `bucketed`(完整桶)
  - `visibleInBucket` 来自 `visibleBuckets`(切过 renderLimit 的桶)
  - 全选/批量导出**仍以 `sortedItems` 为准**,绝对不替换为 `visibleItems`

**验收**:
- 500 条时滚到第二桶中部,第二桶 header 显示 `本周 · 280 项 已显示 180 / 280`
- 全选 500 条,导出会触发 500 次下载(不是 160)

### Task 2.6:subbar 显示计数

**文件**:`tabs/library.tsx`

- [ ] 在 subbar 右侧、批量操作左边新增计数展示:

```tsx
<div style={styles.subbarCount}>
  {visibleItems.length < sortedItems.length
    ? `已显示 ${visibleItems.length} / ${sortedItems.length} 项`
    : `共 ${sortedItems.length} 项`}
</div>
```

- [ ] 复用 `styles.subbarCount`(若无,新增) — 与现有 subbar 内 chip 风格一致(浅灰小字,textTertiary 色调)。

**验收**:
- 0 项时显示 `共 0 项`
- 500 项首次进入显示 `已显示 160 / 500 项`
- 滚到底部显示 `共 500 项`
- 搜索后过滤为 12 项显示 `共 12 项`

### Task 2.7:"显示更多"按钮(滚动兜底)

**文件**:`tabs/library.tsx`

- [ ] 在滚动容器末尾、滚动区底部新增:

```tsx
{visibleItems.length < sortedItems.length && (
  <div style={styles.loadMoreWrap}>
    <button
      className="mc-library-button"
      style={styles.loadMoreBtn}
      onClick={() => setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length))}
    >
      继续加载({sortedItems.length - visibleItems.length} 项)
    </button>
  </div>
)}
```

- [ ] 样式:
  - `loadMoreWrap`:`display: flex; justifyContent: center; padding: 16px 0 8px`
  - `loadMoreBtn`:`background: theme.card; color: theme.textSecondary; border: 0.5px solid theme.hairline; borderRadius: 10; padding: 8px 20px; fontSize: 13; fontWeight: 500`

**验收**:
- 滚动失败时(无障碍工具、键盘 Tab 焦点在按钮)点击按钮追加 120 项
- 全部加载完后按钮消失

### Task 2.8:空状态补"当前筛选说明"

**文件**:`tabs/library.tsx`

- [ ] M5 已有 `emptyLarge`(全局无素材)和 `emptySmall`(筛选无结果)。Task 7 增量:在 `emptySmall` 内文下方补一行"当前筛选:...×N",便于用户清掉筛选。

```tsx
{/* M6 Task 7:在筛选无结果时显示当前筛选条件 */}
<div style={styles.emptySmallFilterSummary}>
  {[
    scope !== "all" && `范围:${scopeLabel(scope)}`,
    collectionFilter && `收藏夹:${collectionFilterName}`,
    platformFilter && `平台:${PLATFORM_LABELS[platformFilter]}`,
    typeFilter && `类型:${typeFilter === "image" ? "图片" : "视频"}`,
    search && `搜索:"${search}"`,
  ].filter(Boolean).join(" · ") || "无筛选条件"}
</div>
```

- [ ] 复用现有 helper:`scopeLabel` 若无则新增,`collectionFilterName` 复用 `collections.find(...)?.name`。

**验收**:
- 搜索"foo"无结果时,小空状态显示 `当前筛选:搜索:"foo"`
- 同时有平台 + 收藏夹 + 搜索,显示 `范围:最近 · 收藏夹:穿搭 · 平台:小红书 · 搜索:"夏"`

### Task 2.9:全选不变量回归

**文件**:`tabs/library.tsx`

- [ ] 在所有 `allCurrentSelected` / `toggleSelectAll` / 批量导出 / 批量删除 / 批量加入收藏夹相关 useMemo 中,**显式 grep 确认**:
  - 不出现 `visibleItems` 在这些路径上
  - 只用 `sortedItems` / `items`

```bash
grep -n "visibleItems" tabs/library.tsx
```

- [ ] 验收:从出现 `visibleItems` 的位置逐一确认用途(应该只在:visibleBuckets 生成 + grid/list 渲染 + subbarCount 文字 + loadMoreWrap 判断)。

**验收**:
- 全选 500 条后,导出会触发 500 次下载
- 全选 500 条后,批量加入收藏夹会处理 500 条
- 滚动到底前 200 条 + 后 300 条,全选文案"已选 500 项"始终正确

## 5. 验证

- [ ] `pnpm build` 通过
- [ ] Chrome `load unpacked` `build/chrome-mv3-dev/`:
  - 用 Task 1 样本脚本注入 100 / 500 / 1000 条
  - 100 条:一次性渲染,无"显示更多"按钮
  - 500 条:首次 160,滚到底自动追加到 ~280 → 400 → 520
  - 1000 条:同上,连续追加
  - 搜索 / 切换平台 / 切换收藏夹,renderLimit 重置回 160
  - 全选文案与实际选择数始终等于 `sortedItems.length`
- [ ] 滚动到底时按钮不显示
- [ ] 反向滚到顶部,renderLimit 不减小
- [ ] PreviewModal 同笔记左右切换仍正常(用 `items` / `noteId` 逻辑)

## 6. 验收指标

| 指标 | 阈值 | 测量方式 |
|---|---|---|
| 500 条库页打开后首屏可操作 | ≤ 2s | Chrome Performance tab |
| 搜索响应 | ≤ 300ms | 输入停顿计时 |
| 筛选切换 | ≤ 300ms | 切换瞬间到结果渲染 |
| 1000 条不白屏 | 是 | 注入 1000 条,DOM 渲染分批 |
| 滚动无明显长卡顿 | 滚动 fps > 30 | Chrome Performance |
| 全选语义 | 基于 sortedItems | 全选 500 条后 console.log |
| 滚动触发追加 | scrollTop + clientHeight ≥ scrollHeight - 480 | e2e 模拟 |

## 7. 风险与处理

### 风险 1:全选语义错误

**处理**:Task 2.9 显式 grep `visibleItems` 在 `sortedItems` 该出现的位置。

### 风险 2:滚动监听抖动

**处理**:用 `Math.min(n + RENDER_INCREMENT, sortedItems.length)` 自然去重;不设 setTimeout debounce(避免追加延迟感知)。

### 风险 3:renderLimit 重置触发频繁(搜索输入字符级变化)

**处理**:useEffect 依赖列表是稳定的,只有 7 个 trigger 全不变时 renderLimit 才不变;这是预期行为(用户每按一个字符搜索就从头开始渲染是合理的)。

### 风险 4:section header 在滚到第二桶中段时第一桶 header 不准确

**处理**:`bucketed` 始终是完整桶,与 renderLimit 无关。第一桶 header 永远显示 `今天 · 80 项` 而不是 `今天 · 80 项 已显示 80 / 80`,因为第一桶在前 160 项内,已全部渲染。

### 风险 5:loadMore 按钮在用户已经滚到底时仍显示

**处理**:按钮条件 `visibleItems.length < sortedItems.length`,滚到底后 `visibleItems.length === sortedItems.length`,按钮自然消失。

## 8. 提交策略

- 一个 PR:`fix(m6): 大列表渐进渲染 + UX 计数/筛选说明`
- 包含 `tabs/library.tsx` 单文件改动
- 改动行数预估:50-80 行(增量,大部分是 useMemo 派生 + 渲染分支判断)
- commit message 中文

## 9. Task 2 与 Task 7 合并的边界

| 来自 | 纳入本子计划 | 不纳入(去其他任务) |
|---|---|---|
| Task 2 渐进渲染 | ✅ Task 2.1-2.4 | — |
| Task 2 全选不变量 | ✅ Task 2.9 | — |
| Task 2 滚动触发追加 | ✅ Task 2.4 | — |
| Task 2 "显示更多" 按钮 | ✅ Task 2.7 | — |
| Task 7 subbar "共 N 项" | ✅ Task 2.6 | — |
| Task 7 section header "X/N" | ✅ Task 2.5 | — |
| Task 7 空状态补筛选说明 | ✅ Task 2.8 | — |
| Task 7 不影响搜索输入 | 不纳入 | Task 6 快捷键 |
| Task 7 1000 条渐进加载 | ✅ Task 2.4 + 2.6 | — |
| Task 7 预览同笔记切换 | 不纳入(无需改动) | — |
