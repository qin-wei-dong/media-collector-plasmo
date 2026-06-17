# M6 大规模素材库效率增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在素材量扩到 500-1000 条时，让库页、导出和收藏夹管理仍然顺手，并先通过 Spike 确认下载链路是否需要改架构。

**Architecture:** 先补齐加载/采集/导出回调的失败兜底，再用真实 Chrome 做下载链路 Spike。性能侧优先做渐进渲染、计算预处理和少量 memo，不默认上虚拟滚动；导出侧基于最终选定的下载实现补历史和失败重试；收藏夹侧在现有侧栏和批量操作上加置顶、颜色、排序与移动能力。

**Tech Stack:** Plasmo MV3、React 18、chrome.storage.local、chrome.downloads、chrome.scripting、TypeScript、现有 `docs/superpowers/` 计划格式

---

> 状态：待复核确认  
> 建议分支：`feat/m6-large-library-efficiency-20260617`  
> 基线：`main` `8c1a53f`（`chore(repo): cleanup repo hygiene — 移除 10 个违规文件 + 补全 .gitignore`）。当前 `main` 已与 `origin/main` 对齐。执行前注意：工作区可能仍有未跟踪的 M5 实施文档，M6 提交不要混入无关文件。  
> 方法：沿用 `docs/superpowers/` 计划格式，先规划、再执行。M6 目标是“大素材量下的效率”，不是继续扩采集链路。

## 1. 目标

M1-M5 已完成可发布版本：采集、弹窗、全屏素材库、收藏夹、分文件夹导出、稳定性打磨。M6 面向更真实的重度使用场景：素材从几十条增长到几百/上千条后，仍然能快速找、批量管、可靠导出。

M6 交付目标：

0. **M6.0 可靠性收口（前置）**：先补齐采集/加载回调兜底，再做真实 Chrome 下载链路 Spike，确认最终采用的下载架构。
1. **大列表可用**：500 条素材下库页打开、搜索、筛选、滚动不明显卡顿。
2. **导出可靠**：导出历史可见，失败项可重试，不再只靠一次性 Toast。
3. **收藏夹管理更快**：支持批量移动、排序/置顶、颜色编辑，减少”分组后难整理”的摩擦。
4. **快捷键更完整**：常用批量操作可以键盘完成，提高重度用户效率。
5. **性能有证据**：先建立测量基线，再决定是否上虚拟滚动，避免过早复杂化。

## 2. 非目标

- 不改 XHS / Douyin 采集策略。
- 不新增云同步、账号体系、付费门控。
- 不做 ZIP 打包。
- 不做导出任务队列 UI 的复杂后台常驻系统。
- 不引入大型状态管理库。
- 不默认引入虚拟滚动第三方库；只有渐进渲染达不到验收指标时再升级。
- 不预先引入 `offscreen` / `declarativeNetRequest` 权限；只有 M6.0 Spike 证明必要时才加。

## 3. 当前基础

已具备：

- `tabs/library.tsx`：搜索、筛选、收藏夹、网格/列表、预览、批量导出。
- `background/download.ts`：service worker 内 fetch + FileReader→dataURL + chrome.downloads。M6.0 会先验证这条链路在真实 Chrome 下是否仍然足够可靠，再决定是否需要调整为别的方案。
- `background/collections.ts`：收藏夹 CRUD、assign/unassign。
- `scripts/a11y-audit.mjs`：popup/library 审计能力。
- `pnpm build` / `pnpm package` 已用于发布前收口。

需要增强：

- 当前库页仍会把匹配结果整体渲染为 DOM；素材量大时可能卡顿。
- 导出结果只通过 Toast 临时反馈，没有可回看的导出历史和失败重试。
- 收藏夹批量管理只有加入/移出，缺少移动、颜色编辑、排序。
- 快捷键主要覆盖搜索/预览，批量选择与管理还不完整。

## 4. 技术策略

### 4.1 性能优化顺序

按复杂度从低到高：

1. **测量与样本数据**：先生成 100 / 500 / 1000 条样本，记录打开、搜索、筛选、滚动体验。
2. **渐进渲染**：默认只渲染前 N 项，滚动接近底部再追加 N 项，并保留“继续加载”兜底按钮。
3. **组件 memo 化**：对 `LibraryCell` / `LibraryRow` 做稳定 props 和 `React.memo`，只做能明显减少渲染的局部改动。
4. **日期/分桶预计算**：统一预计算 `collectedAtMs`、`timeBucket`、`searchHaystack`，避免搜索、排序、看板中重复 `new Date()` 和重复拼字符串。
5. **虚拟滚动**：只有 500 条仍不达标时再做，优先自研轻量固定行高方案；复杂 masonry 虚拟化暂不做。

### 4.2 数据模型策略

M6 可新增一个轻量 storage key：

```ts
export const EXPORT_HISTORY_KEY = "export_history"

export interface ExportHistoryEntry {
  id: string
  createdAt: string
  total: number
  successCount: number
  failedCount: number
  folders: string[]
  itemIds: string[]
  failedFiles?: Array<{
    id?: string
    url: string
    filename: string
    platform?: Platform
    error: string
  }>
}
```

写入规则：

- 所有写入必须走 `enqueueWrite()`。
- 历史保留最近 50 条，避免 storage 膨胀。
- `failedFiles` 只保存重试所需最小字段。
- 不保存 blob / data URL。

### 4.3 UI 策略

- 库页不新增复杂页面，优先在现有右上/Toast/侧栏内增加入口。
- 导出历史可先做一个 modal / drawer，不做独立 tab。
- 收藏夹管理继续留在侧栏和批量条，不做复杂设置页。
- 所有文案简体中文，保持工作台语气。

## 5. 实施任务

### Task 0：开 M6 分支与确认工作区

**目标**：隔离 M6 改动，避免混入 M5 文档或临时样本数据。

- [ ] 从最新 `main` 开分支：

```bash
git checkout main
git pull --ff-only
git checkout -b feat/m6-large-library-efficiency-20260617
```

- [ ] 检查未跟踪文件：

```bash
git status --short
```

- [ ] 如存在 `docs/superpowers/plans/2026-06-17-m5-stability-polish-implementation.md`，决定是否单独提交、保留未跟踪、或纳入文档提交；不要和 M6 业务改动混在一起。

**验收**：

- 分支正确。
- M6 commit 只包含 M6 相关文件。

### Task 0.1：采集 / 加载回调兜底，避免永久 loading

**文件**：`background/index.ts`、`popup.tsx`、`tabs/library.tsx`

**目标**：先把最容易挂死的回调补齐，避免采集按钮、弹窗和库页在错误场景下永久转圈。

- [ ] 给 `collectAndNotify` 加 `.catch(err => callback?.({ success: false, error: String(err) }))`。
- [ ] 给 `GET_ITEMS`、`CLEAR_ITEMS`、`BATCH_DOWNLOAD` 的 `sendResponse` 补 `.catch(...)`，确保 storage 或下载出错时不会卡住回调。
- [ ] 给 `popup.tsx` / `tabs/library.tsx` 的 `loadItems` 回调补 `chrome.runtime.lastError` 检查，并在 `resp === undefined` 时重试 1 次。
- [ ] 同步检查 `loadCollections`、`downloadItems`、删除/撤销/收藏夹 CRUD 这些高频路径的回调兜底，避免 UI 静默失败。

**验收**：

- 模拟 storage 报错后，采集按钮不会永久 loading，提示会落到“采集失败”。
- popup 和库页在 service worker 休眠后仍能恢复加载，或明确提示重试。
- console 不再出现 `Unchecked runtime.lastError`。

### Task 0.2：下载链路可靠性 Spike

**文件**：`background/download.ts`、`background/index.ts`、必要时 `contents/*` / `lib/*`

**目标**：确认当前 SW 下载链路在真实 Chrome 下到底有没有两个风险：防盗链失效、视频大文件内存压力。M6 不在文档里预设答案，只在 spike 后选路。

- [ ] 用真实浏览器分别测：
  - 小红书图片
  - 小红书视频
  - 抖音视频
  - 50MB+ 视频批量下载
- [ ] 记录三项结果：
  - 请求是否被防盗链拦截。
  - 下载是否出现 base64 / memory 压力。
  - 批量下载是否影响 service worker 稳定性。
- [ ] 根据 spike 结果只做**一条**后续方案决策：
  - 若当前链路可用，继续保留 SW 下载，只补最小的健壮性和历史记录。
  - 若防盗链不稳定，优先评估 `declarativeNetRequest` 是否足以解决。
  - 若内存是主问题，再评估 `offscreen` / 流式下载路径。
- [ ] 不在本计划里同时推进多条下载架构分支。

**验收**：

- 有一份明确的 spike 结论。
- spike 结论会直接决定后续实施分支。

---

### Task 1：性能基线与样本数据

**文件**：`scripts/`，必要时 `docs/`

**目标**：先有可重复的性能样本，再决定优化深度。

- [ ] 新增开发脚本 `scripts/generate-sample-items.mjs`，直接输出可粘贴到 Chrome DevTools 的样本 JSON。
- [ ] 样本规模：
  - 100 条
  - 500 条
  - 1000 条
- [ ] 样本字段覆盖：
  - image/video 混合。
  - 小红书/抖音混合。
  - 多作者。
  - 多收藏夹。
  - 图集 `noteId/groupIndex`。
  - `exportedAt` 有/无。
- [ ] 新增一份简单测量记录模板：
  - 库页首次可交互时间。
  - 搜索输入响应。
  - 平台/收藏夹切换响应。
  - 滚动是否掉帧。
  - 预览打开耗时。

**验收**：

- 可以在 Chrome extension storage 中快速注入 500 条样本。
- 样本不会提交为生产数据。
- 文档记录基线结果。

### Task 2：渐进渲染 / 轻量窗口化

**文件**：`tabs/library.tsx`

**目标**：500 条素材下减少一次性 DOM 数量。

- [ ] 新增常量：

```ts
const INITIAL_RENDER_COUNT = 160
const RENDER_INCREMENT = 120
```

- [ ] 新增状态：

```ts
const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_COUNT)
```

- [ ] 当筛选、搜索、排序、视图模式变化时重置 `renderLimit`。
- [ ] 渲染使用 `visibleItems = sortedItems.slice(0, renderLimit)`，并用 `visibleItems` 生成网格/列表。
- [ ] 分桶基于 `visibleItems`，section 标题固定显示 `已显示 X / 共 Y 项`，其中 `X` 为该桶当前已渲染数量，`Y` 为该桶总数量。
- [ ] 内容滚动接近底部时自动增加：

```ts
if (scrollTop + clientHeight >= scrollHeight - 480) {
  setRenderLimit((n) => Math.min(n + RENDER_INCREMENT, sortedItems.length))
}
```

- [ ] 保留“显示更多”按钮作为滚动监听失败时的兜底。
- [ ] `allCurrentSelected` 继续以当前筛选结果 `sortedItems` 为准，不降级为“已显示”。

**验收**：

- 500 条素材下首屏 DOM 明显减少。
- 滚动到底会继续追加。
- 搜索/筛选后从首批结果开始显示。
- 全选语义与文案一致。

### Task 3：组件 memo 与计算缓存

**文件**：`tabs/library.tsx`

**目标**：减少搜索/选择/滚动时不必要的重复渲染。

- [ ] 将 `LibraryCell` 和 `LibraryRow` 用 `React.memo` 包裹。
- [ ] 确保传入 callback 尽量稳定：
  - `toggleItem`
  - `downloadItems`
  - `openSource`
  - `setPreviewItem`
- [ ] 对常用派生字段做轻量预计算：
  - `collectedAtMs`
  - `timeBucket`
  - `searchHaystack`
- [ ] 避免在多个 useMemo 中重复排序 `items`。
- [ ] 看板统计与筛选统计共享预计算结果，避免多次 `new Date()`。
- [ ] 不为了 memo 大改组件结构；只做能明显减少渲染的局部改动。

**验收**：

- 选择一个素材时，非相关卡片不明显闪动。
- 搜索输入不卡顿。
- `pnpm build` 通过。

### Task 4：导出历史与失败重试

**文件**：`types.ts`、`background/storage.ts`、`background/download.ts`、`background/index.ts`、`tabs/library.tsx`

**目标**：导出结果可回看，失败项可重试。

- [ ] 在 `types.ts` 增加：
  - `EXPORT_HISTORY_KEY`
  - `ExportHistoryEntry`
  - `GET_EXPORT_HISTORY`
  - `CLEAR_EXPORT_HISTORY`
  - `RETRY_EXPORT_FAILED`
  - `exportHistory?: ExportHistoryEntry[]`（挂到 `MessageResponse` 上）
- [ ] 在 `background/storage.ts` 增加：
  - `getExportHistory()`
  - `appendExportHistory(entry)`
  - `clearExportHistory()`
  - 写入走 `enqueueWrite()`。
- [ ] `background/download.ts` 在每次 `batchDownload()` 后写历史：
  - 成功数。
  - 失败数。
  - folders。
  - itemIds。
  - failedFiles。
- [ ] `RETRY_EXPORT_FAILED` 复用最终选定的下载实现对 `failedFiles` 重新导出。
- [ ] `tabs/library.tsx` 增加“导出历史”入口：
  - 可放在 toolbar 下载/排序区域附近。
  - 展示最近 10 条。
  - 每条显示时间、成功/失败、目录。
  - 有失败项时显示“重试失败项”。
- [ ] 清空历史需要二次确认，避免误删。

**验收**：

- 导出成功后历史出现一条记录。
- 部分失败历史能看到失败数。
- 点击重试失败项会再次触发下载。
- 历史最多保留 50 条。

### Task 5：收藏夹管理效率增强

**文件**：`types.ts`、`background/collections.ts`、`background/index.ts`、`tabs/library.tsx`

**目标**：素材多了以后，收藏夹本身也要可管理。

- [ ] 扩展 `Collection`：

```ts
sortOrder?: number
pinned?: boolean
```

- [ ] 新增消息：
  - `UPDATE_COLLECTION_COLOR`：`{ id: string; color: string }`
  - `REORDER_COLLECTIONS`：`{ orderedIds: string[] }`
  - `PIN_COLLECTION`：`{ id: string; pinned: boolean }`
  - `MOVE_COLLECTION_ITEMS`：`{ itemIds: string[]; fromCollectionId: string; toCollectionId: string }`
- [ ] 侧栏收藏夹排序规则：
  - pinned 在前。
  - `sortOrder` 小的在前。
  - `sortOrder` 相同时按 `createdAt` 倒序。
- [ ] 收藏夹菜单支持：
  - 重命名。
  - 改颜色。
  - 置顶/取消置顶。
  - 删除。
- [ ] 批量操作支持“移动到收藏夹”：
  - 从当前收藏夹移除并加入目标收藏夹。
  - 与“加入收藏夹”区分，文案明确。
- [ ] 保持向后兼容：旧 collection 没有 `sortOrder/pinned` 时按现有顺序展示。

**验收**：

- 收藏夹能置顶。
- 颜色修改后侧栏圆点实时更新。
- 批量移动后素材只出现在目标收藏夹。
- 删除收藏夹仍只移除归属，不删除素材。

### Task 6：快捷键与批量操作效率

**文件**：`tabs/library.tsx`、必要时 `README.md`

**目标**：重度用户不必频繁移动鼠标。

- [ ] 增加库页快捷键：
  - `Cmd/Ctrl + K`：聚焦搜索（已存在，回归）。
  - `Cmd/Ctrl + A`：全选当前筛选结果（输入框内不拦截）。
  - `Esc`：清空搜索/关闭预览/关闭对话框（已存在，回归）。
  - `Delete` / `Backspace`：删除选中素材，需要确认弹窗或二次动作。
  - `E`：导出选中素材（非输入态）。
  - `C`：打开加入/移动收藏夹面板（非输入态）。
- [ ] UI 中不要展示长篇快捷键教程，只在 tooltip 或 README 记录。
- [ ] 所有快捷键必须避开输入态：

```ts
const target = e.target as HTMLElement
const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
```

- [ ] 危险操作（删除）不能一键直接永久执行，至少沿用现有撤销 Toast 或增加确认。

**验收**：

- 非输入态快捷键有效。
- 输入搜索时不会误触全选/导出/删除。
- 删除后撤销仍可用。

### Task 7：大素材量 UX 细节

**文件**：`tabs/library.tsx`

**目标**：素材多时用户知道自己在哪、看到了多少、还有多少。

- [ ] 在 subbar 右侧、批量操作左边显示当前结果数：
  - `共 N 项`
  - 渐进渲染时显示 `已显示 X / N 项`
- [ ] 空状态补充当前筛选说明。
- [ ] 滚动加载时在列表底部显示 `继续加载...` 按钮，点击后再追加一段内容。
- [ ] 当搜索结果过多时，不改变用户输入，只渐进展示。
- [ ] 预览 siblings 仍以当前 `items` / `noteId` 逻辑工作，不因渐进渲染丢失同笔记切换。

**验收**：

- 1000 条素材下用户知道当前显示范围。
- 显示更多不会破坏时间分组。
- 预览同笔记左右切换仍正常。

### Task 8：验证与发布准备

**文件**：`README.md`、`AGENTS.md`、必要时 `CHANGELOG.md` / release notes

**目标**：M6 可以作为 v2.1.0 或下一个 minor 版本发布。

- [ ] 运行：

```bash
pnpm build
pnpm package
pnpm audit:a11y
```

- [ ] Chrome 手动验证：
  - 100 条素材。
  - 500 条素材。
  - 1000 条素材。
  - 搜索。
  - 平台/类型/收藏夹筛选。
  - 全选/取消全选。
  - 批量加入/移动收藏夹。
  - 批量导出。
  - 导出历史。
  - 失败重试。
  - 删除/撤销。
  - 预览图片/视频。
- [ ] 更新 README：
  - 大素材量优化。
  - 导出历史/失败重试。
  - 收藏夹排序/置顶/颜色编辑。
  - 快捷键。
- [ ] 更新 AGENTS.md：
  - 新 storage key。
  - 新消息类型。
  - 导出历史保留策略。
  - 大列表渲染策略。

**验收**：

- 构建和打包通过。
- 500 条素材下体验达标。
- 用户 Chrome 验收通过后再提交并合并。

## 6. 验收指标

### 性能指标

以 Chrome 实测为准：

- 500 条素材库页打开后 2 秒内可操作。
- 搜索输入后 300ms 内结果有反馈。
- 筛选切换 300ms 内反馈。
- 滚动无明显长时间卡顿。
- 1000 条素材下允许渐进加载，但不能白屏。

### 功能指标

- 导出历史准确记录成功/失败。
- 失败项可重试。
- 收藏夹置顶/颜色/排序生效。
- 批量移动不会丢素材。
- 快捷键不干扰输入。

### 安全指标

- storage 写入仍走 `enqueueWrite()`。
- 下载仍走 background service worker。
- 不保存 blob / data URL 到 storage。
- 导出历史限制最近 50 条。

## 7. 风险与处理

### 风险 1：渐进渲染与全选语义冲突

处理：本计划固定为“全选当前筛选结果”。实现时 `toggleSelectAll`、`allCurrentSelected`、批量导出都必须基于 `sortedItems`，不能改成仅基于 `visibleItems`，避免用户误以为全选后只导出首屏。

### 风险 2：导出历史让 storage 变大

处理：只保留最近 50 条，不保存大字段，不保存 blob/data URL。

### 风险 3：收藏夹移动语义误伤

处理：“加入收藏夹”保留多归属；“移动到收藏夹”明确会从当前收藏夹移除。只有在当前收藏夹视图中显示“移动”主入口。

### 风险 4：快捷键误触

处理：所有快捷键避开输入态；删除类操作保留撤销或确认。

### 风险 5：虚拟滚动过度复杂

处理：先渐进渲染。只有 500 条仍明显卡顿，再单独开 M6.2 做虚拟滚动。

## 8. 推荐里程碑

为了降低风险，建议拆成四个可验收阶段：

### M6.0 核心缺陷修复（前置，必须先完成）

- Task 0.1 采集 / 加载回调兜底。
- Task 0.2 下载链路可靠性 Spike。

> 这两个前置任务不依赖任何 M6 新功能，可以独立交付（甚至 hotfix）。Spike 结论会决定后续导出实现是否继续沿用当前 SW 下载链路。

### M6.1 大列表性能

- Task 1 样本数据与基线。
- Task 2 渐进渲染。
- Task 3 memo / 计算缓存。
- Task 7 大素材量 UX。

### M6.2 导出可靠性

- Task 4 导出历史。
- 失败重试。
- 文档同步下载历史契约。

### M6.3 管理效率

- Task 5 收藏夹管理。
- Task 6 快捷键。
- Task 8 发布验证。

每个阶段结束都要 `pnpm build` + Chrome 手动验收。**M6.0 必须先完成，再进入 M6.1 及之后阶段**；它决定下载/采集是否可靠，后续阶段再继续把大素材库效率往上推。
