# M8 发布后首轮优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于 `docs/superpowers/specs/2026-06-22-post-release-polish-requirements.md` 的已确认口径，把当前 2.1.0 发布版收口为“深色主题优先的小红书素材采集与本地管理工具”，并修掉用户已经能感知到的下载、导出历史、收藏夹移动、右键菜单范围和权限文档不一致问题。

**Architecture:** 先修 P0 的正确性问题，再收紧公开发布范围和权限说明，随后补下载/采集缓存的可靠性，最后同步所有发布文档与 release 检查脚本。整个过程不恢复 popup 主入口，不恢复列表页 hover 采集，不新增 offscreen / DNR 类重权限方案。

**Tech Stack:** Plasmo MV3、React 18、TypeScript、chrome.storage.local、chrome.downloads、chrome.scripting、Vitest、现有 `docs/superpowers/` 计划格式

---

> 状态：待执行  
> 建议分支：`feat/m8-post-release-polish-20260622`  
> 基线：当前 `main` 对齐后的最新提交；执行前先确认工作区是否已有用户改动，避免把无关文档或样本混进来。  
> 已确认口径：
> - R1 只收口为“深色主题优先”，不承诺当前版本 light / auto 主题完整可用。
> - R5 右键菜单采用方案 A，仅在小红书页面展示。
> - R7 下载超时文案使用“下载超时,请在导出历史中重试”。
> - R10 导出完成保留系统通知，库页继续显示 Toast。

## 1. 目标

M8 只做发布后首轮收口，不扩新能力。目标是让当前版本在用户最常碰到的几条路径上做到一致、可解释、可回退：

1. **下载路径正确**：单卡片下载不再受旧收藏夹上下文影响。
2. **导出反馈准确**：导出完成后导出历史和失败角标立即刷新。
3. **收藏夹移动稳定**：移动收藏夹时不产生重复 `collectionIds`，UI 不提供同源目标。
4. **公开范围收窄**：右键菜单只在小红书页面出现，非小红书页面不再引导到 `unknown` 入库。
5. **权限更干净**：移除不再需要的 `activeTab`，同步所有发布文档。
6. **采集缓存更靠谱**：`__mc_notes__` 按最近使用语义淘汰。
7. **下载状态真实**：15 秒兜底不再把未知状态当成功。
8. **文档完全对齐**：README / CHANGELOG / release docs / 商店文案 / checklist 全部和当前行为一致。

## 2. 非目标

- 不恢复 popup 作为当前发布入口。
- 不恢复小红书列表页 hover 采集。
- 不重做视觉设计或主题系统。
- 不引入云同步、账号体系、付费门控。
- 不把下载链路改成 offscreen / DNR / 常驻队列架构。
- 不做大规模 `LibraryPage` 重构；本轮只做局部修补。

## 3. 现有基础

已具备：

- `tabs/library.tsx`：全屏素材库、搜索、筛选、预览、收藏夹、批量导出、导出历史 modal。
- `background/download.ts`：SW 内下载、导出历史写入、失败项重试。
- `background/collections.ts`：收藏夹 CRUD、排序、置顶、移动。
- `lib/xhs-state-inject.ts`：MAIN world 拦截器，写入 `__mc_state__` / `__mc_notes__`。
- `scripts/test-release-scope.mjs`：发布范围 smoke check。
- `background/download.test.ts`、`background/storage.test.ts`、`lib/export-path.test.ts`：已有纯逻辑单测基础。

需要补齐：

- 单卡片导出上下文仍可能被旧闭包捕获。
- 导出历史更新只在部分路径里立即刷新。
- `moveCollectionItems()` 仍会把目标 id 重复塞回数组。
- 右键菜单对非小红书页面仍可见。
- `activeTab` 仍在 manifest 和公共文档中出现。
- `__mc_notes__` 的 recency 还不是严格最近使用。
- `downloadOne()` 15 秒兜底仍可能把未知下载状态当成功。

## 4. 文件结构

- Modify: `tabs/library.tsx`
  - 修复单卡片下载上下文。
  - 导出完成后刷新导出历史。
  - 收藏夹移动 UI 禁止同源目标。
- Modify: `components/CollectionDialog.tsx`
  - 在“移动到...”场景里禁用当前收藏夹选项。
- Modify: `background/index.ts`
  - 右键菜单仅在小红书页面出现。
  - 非小红书页面触发时给轻量提示并阻止入库。
- Modify: `background/collections.ts`
  - `moveCollectionItems()` 去重目标 id。
- Add: `background/collections.test.ts`
  - 覆盖移动去重、同源防线、目标不存在等场景。
- Modify: `background/download.ts`
  - 15 秒兜底改为“查状态后再决定成功/失败”。
  - 失败原因进入 `failedFiles.error`。
- Modify: `background/download.test.ts`
  - 覆盖 complete / interrupted / timeout / search 状态未知。
- Modify: `lib/xhs-state-inject.ts`
  - `__mc_notes__` 写入时刷新 key 顺序。
- Add: `lib/xhs-state-inject.test.ts` 或 `lib/xhs-note-cache.test.ts`
  - 纯逻辑验证 recency 和 200/150 淘汰规则。
- Modify: `package.json`
  - 移除 `activeTab`。
- Modify: `README.md`
  - 收口主题承诺、导出反馈、发布范围、手动验证项。
- Modify: `CHANGELOG.md`
  - 增加 M8 / Unreleased 收口说明。
- Modify: `AGENTS.md`
  - 更新当前发布范围与主题口径，避免后续 agent 误读。
- Modify: `docs/index.html`
  - 同步权限与发布范围说明。
- Modify: `docs/release/chrome-web-store-listing.md`
  - 同步商店标题、描述、权限解释、系统通知口径。
- Modify: `docs/release/privacy.md`
  - 同步权限解释和本地存储范围。
- Modify: `docs/release/release-checklist.md`
  - 补导出通知、右键范围、权限、主题承诺检查。
- Modify: `scripts/test-release-scope.mjs`
  - 增加发布文案、权限、主题、系统通知、右键范围检查。

## 5. 实施任务

### Task 0：开分支与确认基线

**目标**：把 M8 改动和用户当前工作隔离开，避免把无关文件混进发布收口。

- [ ] 从当前 `main` 拉出分支：

```bash
git checkout main
git pull --ff-only
git checkout -b feat/m8-post-release-polish-20260622
```

- [ ] 检查工作区：

```bash
git status --short
```

- [ ] 如果存在用户未提交改动，先确认是否需要一起保留；不要擅自回滚。

**验收：**

- 分支创建成功。
- 工作区里只保留准备纳入 M8 的文件。

---

### Task 1：R2 单卡片下载上下文修复

**目标**：用户切换收藏夹、重命名收藏夹后，单卡片下载仍然使用当前的 `collectionFilter` 和 `collections`。

**文件：**

- Modify: `tabs/library.tsx`

**实施步骤：**

- [ ] 把导出上下文抽成稳定引用，推荐用 `useRef` 存当前 `ExportContext`。
- [ ] 用 `useEffect` 在 `collectionFilter` / `collections` 变化时同步 ref。
- [ ] 把 `downloadItems` 提升为稳定回调，内部读取 ref，而不是读取首屏闭包里的旧值。
- [ ] 把 `clearSelection` 也收成稳定 helper，避免为了导出修复引入新的依赖噪音。
- [ ] `handleDownloadOne` 只依赖稳定的 `downloadItems`，不要再锁死首屏闭包。
- [ ] bulk 导出继续走当前批量逻辑，不改用户路径。

**建议实现形态：**

```ts
const exportContextRef = useRef<ExportContext>({ collectionFilter, collections })
useEffect(() => {
  exportContextRef.current = { collectionFilter, collections }
}, [collectionFilter, collections])
```

**验收：**

- 收藏夹 A 下点单卡片下载，文件路径落到 A。
- 切到收藏夹 B，不刷新页面，再点同一素材，文件路径落到 B。
- 重命名收藏夹后不刷新页面，单卡片下载使用新名字。

**测试与回归：**

- `lib/export-path.test.ts` 继续保留导出路径纯函数覆盖。
- 手动在 Chrome 下载记录里核对单卡片导出路径。

---

### Task 2：R3 导出历史与失败角标即时刷新

**目标**：普通导出完成后，toolbar 上的导出历史数量和失败角标立即更新，不再依赖刷新页面。

**文件：**

- Modify: `tabs/library.tsx`
- Modify: `background/download.ts`（如需微调返回结构，不强制）

**实施步骤：**

- [ ] 在 `BATCH_DOWNLOAD` 回调的成功、部分成功、全失败三条分支里，都触发一次 `loadHistory()`。
- [ ] 不要只在 `RETRY_EXPORT_FAILED` 路径里刷新历史。
- [ ] 如果后续想减少一次 storage 读取，可以再考虑复用 `resp.history`；但本轮优先以 storage 为准，避免后台 append 失败时 UI 误报。
- [ ] 成功导出后继续 `loadItems()`，保持素材列表里的 `exportedAt` 展示同步。
- [ ] 清空历史后再导出，确保 badge 从 0 正确增长。

**验收：**

- 成功导出一次后，导出历史 badge 立即 +1。
- 部分失败时失败角标立即更新。
- 全失败时导出历史 modal 立刻看得到新记录。

**测试与回归：**

- 通过 `scripts/a11y-audit.mjs` 的 mock harness 验证导出历史按钮文案和角标渲染。
- 手动导出一轮后，不刷新页面直接打开导出历史，确认数据已更新。

---

### Task 3：R4 收藏夹移动去重

**目标**：`moveCollectionItems()` 不再把 `collectionIds` 里已经存在的目标 id 重复推回去。

**文件：**

- Modify: `background/collections.ts`
- Modify: `tabs/library.tsx`
- Modify: `components/CollectionDialog.tsx`
- Add: `background/collections.test.ts`

**实施步骤：**

- [ ] 在 `moveCollectionItems()` 里，把目标 id 追加后立刻去重，确保 `collectionIds` 不会出现 `["B", "B"]` 这种结果。
- [ ] 保留 `fromCollectionId === toCollectionId` 的后端防线。
- [ ] 在库页“移动到...”场景里，把当前收藏夹选项置灰或禁用，不让用户直接点到自己。
- [ ] 如果对话框里当前收藏夹已被禁用，保留可读提示，避免用户误以为列表坏了。
- [ ] 后端返回的 `movedCount` 仍只统计真正发生变化的条目。

**建议实现形态：**

```ts
const nextIds = Array.from(new Set([...item.collectionIds.filter((id) => id !== fromCollectionId), toCollectionId]))
```

**验收：**

- `["A", "B"]` 从 A 移到 B 后，结果只剩 `["B"]`。
- 目标收藏夹计数不再因为重复 id 虚高。
- 同源移动不会把数据写坏。

**测试建议：**

- 新增 `background/collections.test.ts`，覆盖：
  - 普通 A -> B
  - 已属于 B 的 A -> B
  - from/to 相同
  - 目标收藏夹不存在

---

### Task 4：R5 右键菜单收窄到小红书页面

**目标**：右键菜单只在小红书页面出现，非小红书页面不会把素材采到 `unknown`。

**文件：**

- Modify: `background/index.ts`
- Modify: `scripts/test-release-scope.mjs`

**实施步骤：**

- [ ] 在 `chrome.contextMenus.create()` 里加页面限制，使用 `documentUrlPatterns: ["https://www.xiaohongshu.com/*"]`。
- [ ] 保持 `contexts: ["image", "video"]` 不变，只收窄展示范围，不改素材类型。
- [ ] `onClicked` 里再加一层防线：如果 `info.pageUrl ?? tab?.url` 不是小红书，直接返回，不调用 `collectAndNotify()`。
- [ ] 轻量提示文案保持中文，避免给用户造成“功能坏了”的错觉。
- [ ] 不在任何路径里把非 XHS 右键采集继续落成 `unknown` 入库。

**建议提示文案：**

- 标题：`仅支持小红书页面`
- 正文：`请在小红书页面右键采集素材`

**验收：**

- 普通网页右键图片/视频，不出现“采集此素材”菜单。
- 小红书页面里正常显示菜单。
- 异常路径下不会写入 `unknown` 素材。

**测试建议：**

- `scripts/test-release-scope.mjs` 增加 context menu 限制检查。
- 手动在普通网页和小红书页面分别右键验证。

---

### Task 5：R9 权限最小化，移除 `activeTab`

**目标**：manifest 权限只保留真实调用点，减少 Chrome Web Store 审核解释成本。

**文件：**

- Modify: `package.json`
- Modify: `docs/index.html`
- Modify: `docs/release/chrome-web-store-listing.md`
- Modify: `docs/release/privacy.md`
- Modify: `docs/release/release-checklist.md`
- Modify: `scripts/test-release-scope.mjs`

**实施步骤：**

- [ ] 从 `manifest.permissions` 中移除 `activeTab`。
- [ ] 复核代码调用点，确认没有任何 runtime 逻辑依赖 `activeTab`。
- [ ] 把所有公开文档里的 `activeTab / tabs` 说明收口为只解释 `tabs`。
- [ ] 商店权限说明改成“打开或聚焦素材库页面”，不要继续写“配合当前标签页采集操作”这类空泛描述。
- [ ] `scripts/test-release-scope.mjs` 增加断言：`activeTab` 不在 manifest 权限中，公共文档里也不再出现它。

**验收：**

- manifest、文档、代码调用点一一对应。
- 发布说明不再把 `activeTab` 当作必要权限解释。

---

### Task 6：R6 `__mc_notes__` 真正按最近使用淘汰

**目标**：`__mc_notes__` 被重新拦截时，淘汰顺序更新到最后，不再按老插入顺序误删。

**文件：**

- Modify: `lib/xhs-state-inject.ts`
- Add: `lib/xhs-state-inject.test.ts` 或 `lib/xhs-note-cache.test.ts`

**实施步骤：**

- [ ] 在 `processApiResponse()` 里写入 `cache[n.id]` 之前，先判断是否已有同名 key。
- [ ] 如果已经有，先 `delete cache[n.id]` 再重新赋值，让对象 key 顺序刷新。
- [ ] 继续保留 200 上限、150 回收的剪枝逻辑。
- [ ] 保证旧格式 `cache[noteId] = media` 仍可直接读取，不改读取结构。
- [ ] `stateInjector()` 继续保持自包含，不引用外部 helper。

**建议实现形态：**

```ts
if (Object.prototype.hasOwnProperty.call(cache, n.id)) {
  delete cache[n.id]
}
cache[n.id] = media
```

**测试建议：**

- 新增纯逻辑测试覆盖：
  - 新增超过 200 条时只保留最近 150 条。
  - 已存在 key 重写后顺序刷新。
  - 旧缓存结构仍可直接读取。
- 如果需要更强的可测性，可以把缓存 upsert / prune 抽成同构 helper，再在 `stateInjector()` 内同步同样的逻辑。

---

### Task 7：R7 下载完成状态必须真实可信

**目标**：15 秒兜底不再把未知下载状态当成功，避免导出历史把失败记录成已导出。

**文件：**

- Modify: `background/download.ts`
- Add / Modify: `background/download.test.ts`

**实施步骤：**

- [ ] 把 `downloadOne()` 里的“15 秒后无条件 resolve”改成“超时后先查状态，再决定成功/失败”。
- [ ] 先等 `chrome.downloads.onChanged`；如果已经收到 `complete` 就直接成功。
- [ ] 如果收到 `interrupted` 就直接失败。
- [ ] 超时后调用 `chrome.downloads.search({ id: downloadId })`。
- [ ] `complete` -> resolve；`interrupted` -> reject；`in_progress` 或查不到 -> reject 为 `下载超时,请在导出历史中重试`。
- [ ] `downloadOne()` 只在确认 complete 后才会让 `successfulIds` 进入 `markItemsExported()`。
- [ ] `failedFiles.error` 记录真实错误消息，供导出历史重试。

**建议实现形态：**

```ts
const rows = await chrome.downloads.search({ id: downloadId })
if (rows[0]?.state === "complete") resolve()
else reject(new Error("下载超时,请在导出历史中重试"))
```

**测试建议：**

- `background/download.test.ts` 用 fake timers / mock `chrome.downloads` 覆盖：
  - onChanged complete
  - onChanged interrupted
  - onChanged 不触发但 search complete
  - onChanged 不触发且 search in_progress / 空结果
- 确认 timeout 场景不会把文件写成 `exportedAt` 成功。

---

### Task 8：R1 / R8 / R10 文档同步

**目标**：公开文案只保留当前真实行为，不继续承诺主题切换、打开文件夹或错误的权限范围；同时明确系统通知保留。

**文件：**

- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `AGENTS.md`
- Modify: `docs/index.html`
- Modify: `docs/release/chrome-web-store-listing.md`
- Modify: `docs/release/privacy.md`
- Modify: `docs/release/release-checklist.md`
- Modify: `scripts/test-release-scope.mjs`

**实施步骤：**

- [ ] `README.md` 的主题相关描述统一改成“深色主题优先”，移除“当前已支持 light/auto 切换”的公开承诺。
- [ ] `README.md` 手动验证列表移除主题切换，或明确写成“当前以深色主题为主”。
- [ ] `README.md` 和商店文案把“打开文件夹”改成“打开下载目录”。
- [ ] `CHANGELOG.md` 增加 M8 / Unreleased 收口段，描述当前公开范围、权限收口、系统通知保留。
- [ ] `AGENTS.md` 里的发布范围说明和主题口径同步到当前版本，避免后续 agent 又把 popup / 主题按钮 / 泛网页采集写回去。
- [ ] `docs/release/chrome-web-store-listing.md` 说明导出完成会保留系统通知，同时库页会有 Toast。
- [ ] `docs/release/privacy.md` 和 `docs/index.html` 统一权限解释，不再提 `activeTab`。
- [ ] `docs/release/release-checklist.md` 加入导出完成系统通知、非小红书右键不出现菜单、主题承诺仅为深色优先等检查项。
- [ ] `scripts/test-release-scope.mjs` 扩展到扫描 README / 商店文案 / 隐私页 / checklist / AGENTS 中的冲突词。

**建议扫描关键词：**

- `主题切换`
- `light 主题`
- `跟随系统`
- `auto / dark / light`
- `打开文件夹`
- `popup.tsx`
- `popup.html`
- `activeTab`
- `Douyin`
- `抖音`

**验收：**

- 公开文案与真实 UI 一致。
- 没有再把主题切换、popup 主入口、泛网页采集写成当前发布承诺。
- 导出完成保留系统通知这一点在文档里说得清楚。

---

## 6. 建议实施顺序

### 第一批：P0 正确性

1. R2 单卡片下载上下文
2. R3 导出历史即时刷新
3. R4 收藏夹移动去重

这三项改动面小、收益直接，先落地能立刻提升用户可感知体验。

### 第二批：公开范围与权限

1. R5 右键菜单收窄到小红书页面
2. R9 移除 `activeTab`

这批直接影响 Chrome Web Store 解释成本和用户预期，应该在下一次商店版本提交前完成。

### 第三批：可靠性

1. R6 `__mc_notes__` 最近使用淘汰
2. R7 下载真实完成状态

这批涉及后台和注入逻辑，完成后应补齐更细的单测。

### 第四批：文档收口

1. R1 深色主题优先的文档收口
2. R8 发布文档一致性
3. R10 导出完成保留系统通知的文档说明

这批以文档为主，但必须和代码事实保持一一对应。

## 7. 测试与验收总计划

每批完成后至少跑：

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm test:release-scope
pnpm audit:a11y
```

发布前再跑：

```bash
pnpm package
```

### 手动回归清单

- 小红书首页浮层采集图片笔记。
- 小红书首页浮层采集视频笔记。
- 小红书独立详情页采集。
- 快捷键采集。
- 库页加载、搜索、平台筛选、类型筛选、排序、视图切换。
- 单卡片下载切换收藏夹前后路径正确。
- 批量导出、部分失败重试。
- 导出历史数量、失败角标、清空历史。
- 收藏夹创建、重命名、改色、置顶、加入、移动、移出、删除。
- 移动到当前收藏夹时 UI 不提供同源目标。
- 删除素材与撤销。
- 非小红书网页右键菜单不出现。
- 导出完成后系统通知仍然出现，库页 Toast 也继续出现。
- README / 商店文案 / 隐私页 / checklist 中没有旧承诺。

## 8. 风险与注意事项

- `stateInjector()` 必须保持自包含，不能引用外部 helper。
- `contents/*.ts` 会自动成为 content script，新增公共 helper 不要放进 `contents/`。
- 不要恢复旧 popup 主入口。
- 不要恢复小红书 hover 采集。
- `chrome.storage.local` 写入继续走 `enqueueWrite()`。
- 下载链路不要为了这轮修复引入更重权限；先在现有 SW 架构内把状态判断修正正确。
- 文档收口优先于视觉重做；本轮主题只做“深色主题优先”的发布承诺收口。
- 任何新增 release 文案都必须和 `scripts/test-release-scope.mjs` 的检查项同步。

