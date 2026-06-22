# LibraryPage 拆分设计(整体蓝图 + 分批实现)

**日期**: 2026-06-22
**分支**: `refactor/20260622-library-page-split`
**状态**: 设计已批准,待写批 1 实现计划

## 1. 背景与目标

`tabs/library.tsx` 是 3006 行的"上帝文件":主组件 `LibraryPage`(L170-1344,1174 行)持有 15 个 useState + 17 个 useMemo + 4 个 useCallback + 6 个 useEffect;文件里还内联了 6 个独立组件(~610 行)和 `makeStyles`(~1032 行)。

经过前三个阶段(清债 + 纯逻辑测试 32 + mock 类测试 15 = 47 测试),测试网已就绪,可以安全地拆分。

**目标**: `library.tsx` 降到 ~400 行,`LibraryPage` 只做布局编排 + state 协调;可独立测试/理解的单元各归其位。

**约束**:
- **纯重构,UI 行为零变化** —— 47 测试 + 手测做回归保护
- **保持 useState** —— 不引入 reducer/context/zustand,各 hook 持有自己的 state、返回 state+setter,LibraryPage 协调
- **分批实现** —— 风险递增分 3 批,每批独立 plan + 实现 + 验证

## 2. 分批策略

| 批次 | 内容 | 风险 | 迁出行数 | 前置 |
|---|---|---|---|---|
| **批 1** | `makeStyles` → `lib/library-styles.ts` | 最低(纯移动) | ~1032 | 无 |
| **批 2** | 6 组件 → `components/` | 低(边界清晰、props 传递) | ~610 | 批 1 |
| **批 3** | hooks → `lib/hooks/` | 高(state/useMemo 依赖链) | ~700 | 批 2 |

本 spec 覆盖整体蓝图。**writing-plans 先出批 1 详细 plan**;批 2/3 待前批完成 + 验证通过后,各自调 writing-plans 出 plan。

---

## 3. 批 1:`makeStyles` 抽出

**新建 `lib/library-styles.ts`**:
- 迁出 `makeStyles(theme: ThemeTokens): Record<string, React.CSSProperties>`(整段,~1032 行)
- `export function makeStyles`

**改 `tabs/library.tsx`**:
- 删除 `makeStyles` 定义(L1974-3006)
- 加 `import { makeStyles } from "../lib/library-styles"`
- 5 处 `useMemo(() => makeStyles(theme), [theme])`(L104/1295/1435/1537/1698/1808)保持不变(只是 makeStyles 来源变 import)

**验证**: `pnpm test` 47 绿 + `tsc --noEmit` 0 错误 + `pnpm build` DONE + 手测 UI 样式无变化。

---

## 4. 批 2:6 组件抽到 `components/`

每个组件整段迁出,props 接口即其现有签名(实施时从代码读取并显式声明 `interface Props`)。

| 新文件 | 来源行 | 职责 | props(实施时确认) |
|---|---|---|---|
| `components/Icon.tsx` | L1904 | 16 种图标 SVG | `{ name: IconName; size?; ... }` + `IconName` 类型 + `Icon` |
| `components/LibraryToast.tsx` | L1874 | 底部 snackbar | `{ notice: Notice; onDismiss: () => void }` + `Notice` 类型 |
| `components/LibraryCell.tsx` | L1345 | 网格卡(`memo`) | `{ item; selected; onPreview; onToggle; onDownload; onOpenSource; styles }` |
| `components/LibraryRow.tsx` | L1491 | 列表行(`memo`) | 同 Cell 语义 |
| `components/CollectionDialog.tsx` | L1586 | 收藏夹 dialog | `{ dialog; collections; onClose; onCreate; onRename; ... }` |
| `components/ExportHistoryModal.tsx` | L1754 | 导出历史 modal | `{ history; onClose; onRetry; onClear }` |

`Notice`/`IconName`/`DialogState` 等共享类型:放各组件文件并 export,或抽到 `types.ts`(实施时按引用面决定)。

**改 `tabs/library.tsx`**:删 6 组件定义,加 6 个 import。

**验证**: 同批 1,重点手测 dialog/modal/toast/cell/row 交互。

---

## 5. 批 3:hooks 抽到 `lib/hooks/`(核心)

### 5.1 hooks 划分(6 个,按职责 + 依赖链)

```
useLibraryData()        → { items, collections, history, loadItems, loadCollections, loadHistory }
        │ items
        ▼
useEnrichedItems(items) → { enrichedItems }   ← 基础派生(_collectedAtMs/_timeBucket/_searchHaystack)
        │ enrichedItems
        ├─▶ useFilteredItems(enrichedItems, filters, sortDesc)
        │       → { filteredItems, sortedItems, buckets, visibleItems, visibleBuckets, renderLimit, loadMore }
        ├─▶ useStats(items, collections, enrichedItems)
        │       → { stats, authors, sidebarCounts, collectionCounts, noteImageCounts }
        └─▶ useSortedCollections(collections)
                → { sortedCollections }

useSelection(items, filters) → { selectedIds, selectedItems, toggleItem, clearSelection }   ← 独立
```

### 5.2 hooks 接口(设计层,实施时按实际 useMemo 依赖校准)

| Hook | 持有 state | 计算(useMemo) | 入参 | 出参 |
|---|---|---|---|---|
| `useLibraryData` | items, collections, history | — | 无 | 三 state + 三 load fn + 初始化 useEffect |
| `useEnrichedItems` | — | enrichedItems | items | enrichedItems |
| `useFilteredItems` | renderLimit | filteredItems, sortedItems, buckets, visibleItems, visibleBuckets | enrichedItems, {search, scope, collectionFilter, platformFilter, typeFilter}, sortDesc | 上列 + loadMore |
| `useStats` | — | stats, authors, sidebarCounts, collectionCounts, noteImageCounts | items, collections, enrichedItems | 上列 5 项 |
| `useSortedCollections` | — | sortedCollections | collections | sortedCollections |
| `useSelection` | selectedIds | selectedItems | items, filters | selectedIds, selectedItems, toggleItem, clearSelection + 清理 useEffect |

### 5.3 state 归属

**进 hooks**:
- `useLibraryData`: items, collections, history
- `useFilteredItems`: renderLimit(渐进渲染)
- `useSelection`: selectedIds

**留 LibraryPage(UI 协调态)**:
- search, scope, collectionFilter, platformFilter, typeFilter, viewMode, sortDesc(筛选/视图 —— 传给 hooks)
- previewItem, notice, dialog, showHistory, batchDownloading(UI 态)

### 5.4 handlers 归属
- `toggleItem`/`clearSelection` → `useSelection`
- `handleToggleItem`(`useCallback` 包装)→ `useSelection` 或留 LibraryPage
- `handlePreviewItem`/`handleDownloadOne`/`handleOpenSource`/`downloadItems`/`openSource` → 留 LibraryPage(业务操作,跨 hooks)
- `loadItems`/`loadCollections`/`loadHistory` → `useLibraryData`
- 渐进渲染/滚动监听 useEffect(L264/273/280) → `useFilteredItems`(loadMore 语义)

### 5.5 数据流
`useLibraryData` 提供原始数据 → `useEnrichedItems` 派生基础 → `useFilteredItems` + `useStats` 消费;`useSelection` + `useSortedCollections` 独立。LibraryPage 调用所有 hooks、持有 UI 态、传参协调、JSX 编排。

**改 `tabs/library.tsx`**:删 hooks 相关 state/useMemo/handlers/effect,改为调 6 hooks + `import`。

---

## 6. 拆后 LibraryPage 结构(~400 行)

```
LibraryPage() {
  // 数据
  const { items, collections, history, loadItems, ... } = useLibraryData()
  const { enrichedItems } = useEnrichedItems(items)
  // 筛选/视图 UI 态(留此处)
  const [search, setSearch] = useState(""); const [scope, setScope] = ...
  // 派生
  const { filteredItems, sortedItems, buckets, visibleItems, ... } = useFilteredItems(enrichedItems, {search, scope, ...}, sortDesc)
  const { stats, authors, ... } = useStats(items, collections, enrichedItems)
  const { sortedCollections } = useSortedCollections(collections)
  const { selectedIds, selectedItems, toggleItem, clearSelection } = useSelection(items, {search, scope, ...})
  // UI 态
  const [previewItem, setPreviewItem] = ...; const [notice, setNotice] = ...
  // 业务 handlers
  const handleDownloadOne = ...; const handleExport = ...
  // JSX 布局编排(左侧栏/toolbar/看板/subbar/滚动区/dialogs/toast)
  return <Layout>...</Layout>
}
```

---

## 7. 测试与验证(每批后)

- `pnpm test` → 47 绿(纯重构,行为不变,回归保护)
- `pnpm exec tsc --noEmit` → 0 错误(漏 import / 接口错会被捕获)
- `pnpm build` → DONE
- 手测 UI 无回归:采集 / 库页加载 / 筛选(平台+类型+搜索) / 视图切换 / 排序 / 预览 / 批量选择 / 导出 / 收藏夹 dialog / 删除撤销 / 导出历史 / 主题切换
- hooks 单测本轮 **YAGNI**(`useFilteredItems`/`useStats` 是纯逻辑 hook,未来可 `renderHook` 测,本轮聚焦拆分)

---

## 8. 风险

- **批 3 hooks 依赖链**: `enrichedItems` 被 `useFilteredItems` + `useStats` 共享(必须由 `useEnrichedItems` 单点派生,避免重复计算);`selectedItems` 依赖 `items` + `selectedIds`;渐进渲染 `useEffect` 归属 `useFilteredItems` 时要带走滚动监听 + `renderLimit`。实施时对照原 useMemo deps 数组逐个校准。
- **批 2 props 完整性**: `CollectionDialog`/`ExportHistoryModal` props 多,漏 prop 会被 tsc 捕获(安全网)。
- **共享类型**: `Notice`/`IconName`/`DialogState`/`ExportContext` 等跨组件/hooks 类型,需明确归属(组件文件 export 或 types.ts)。
- **每批独立 commit + 验证**: 一批出问题不污染其他批;47 测试 + 手测每批把关。

---

## 9. 实施计划

- **批 1(本 spec 后立即规划)**: writing-plans 出 makeStyles 抽出 plan → 实现 → 验证 → 合并
- **批 2(批 1 合并后)**: writing-plans 出 6 组件抽出 plan → 实现 → 验证 → 合并
- **批 3(批 2 合并后)**: writing-plans 出 hooks 抽出 plan(最复杂,可能再细分) → 实现 → 验证 → 合并

每批结束重新评估:若某批发现设计偏差(如 hooks 划分需调整),回到本 spec 修订后再继续下批。
