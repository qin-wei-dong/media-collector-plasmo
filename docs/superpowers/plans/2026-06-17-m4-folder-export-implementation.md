# M4 分文件夹导出 + 导出反馈 Toast 实施计划

> 状态：待复核确认  
> 分支：`feat/m4-folder-export-20260617`  
> 基线：本地 `main` `cba94a8`（`merge: m3 collections library`）。当前本地 `main` 领先 `origin/main` 8 个提交，远端尚未包含近期 M1-M3 合并结果。  
> 方法：按 `$superpowers:using-superpowers` 流程先规划、再执行；本文件只定义实施步骤，不直接改业务代码。

## 1. 目标

M4 要把“导出素材”从单纯下载升级为可直接落地到本地素材库的工作流：

1. 在全屏素材库页选择素材后，导出到 `media-collector/<收藏夹名 或 作者名 或 未分类>/` 子目录。
2. 导出完成后给出明确 Toast，例如：`已导出 12 项到 素材库/618选题/`。
3. Toast 提供“打开文件夹”动作，方便用户立刻检查本地下载结果。
4. 成功导出的素材写入 `exportedAt`，让库页看板“本周已导出”从展示占位变成真实指标。
5. 保持现有 background 下载链路：继续用 service worker `fetch + Referer + data URL + chrome.downloads.download` 绕 CDN 防盗链。

## 2. 当前状态

M3 已经合入本地 `main` 并作为当前分支起点：

- `types.ts` 已有 `Collection`、`MediaItem.collectionIds`、`MediaItem.exportedAt`。
- `background/collections.ts` 已实现收藏夹 CRUD、批量加入/移出收藏夹，并通过 `enqueueWrite()` 写入。
- `tabs/library.tsx` 已有左侧栏、看板、筛选、全选/取消全选、预览、批量导出按钮、Toast。
- `tabs/library.tsx` 的“本周已导出”已经读取 `item.exportedAt`，但当前没有任何后台逻辑写入这个字段。
- `background/download.ts` 当前 `batchDownload()` 只接收 `{ url, filename, platform }`，所有文件下载到 `media-collector/<filename>`。
- `background/download.ts` 当前按第一项素材的 `platform` 生成 Referer，混合平台批量导出时存在 Referer 不准确风险。

## 3. 范围

M4 v1 聚焦“全屏素材库页”的生产工作流：

- 改 `tabs/library.tsx`：根据当前收藏夹/素材归属/作者生成导出子目录；成功后刷新素材列表和看板；Toast 显示真实路径。
- 改 `types.ts`：扩展 `BATCH_DOWNLOAD` payload 和 response，补充打开下载文件夹消息。
- 改 `background/download.ts`：支持子目录文件名、逐项平台 Referer、返回成功导出信息。
- 改 `background/storage.ts`：新增 `markItemsExported()`，通过 `enqueueWrite()` 批量写入 `exportedAt`。
- 改 `background/index.ts`：路由新增/扩展下载相关消息。
- 兼容 `popup.tsx`：允许它继续发平铺文件名；如顺手低风险，可补上 `id` 以复用 `exportedAt` 记录，但不把“按收藏夹导出”扩展到弹窗。

非目标：

- 不做云同步、付费门控、导出历史页面。
- 不改 XHS/Douyin 采集逻辑。
- 不重新引入小红书列表页 hover 采集。
- 不做虚拟滚动、批量重命名、ZIP 打包。

## 4. 用户体验规则

### 4.1 文件夹规则

导出文件最终路径：

```text
media-collector/<folder>/<filename>
```

`<folder>` 解析优先级：

1. 当前正在查看某个收藏夹时，所有选中素材导出到该收藏夹名。
2. 不在收藏夹视图时，如果素材已有 `collectionIds`：
   - 按 `collections` 当前顺序找到第一个匹配收藏夹；
   - 找不到时回退到素材 `collectionIds[0]` 对应名称；
   - 仍找不到则继续回退作者。
3. 无收藏夹归属时，用 `item.author`。
4. 作者为空时，用 `未分类`。

原因：素材支持多收藏夹，导出时必须有稳定、可解释的单一目标。当前收藏夹视图优先，符合用户“我正在导出这个选题素材”的心智。

### 4.2 路径清洗

文件夹名和文件名都要清洗非法字符：

```ts
value.replace(/[/\\?%*:|"<>]/g, "-").trim()
```

额外规则：

- 空字符串回退 `未分类` 或 `素材`。
- 路径段长度建议限制在 50 个字符以内，避免超长下载路径。
- 不允许 `.`、`..` 作为文件夹名。
- 不允许调用方传入以 `/` 开头的绝对路径。

### 4.3 Toast 规则

成功：

- 单一目标目录：`已导出 N 项到 素材库/<folder>/`
- 多目标目录：`已导出 N 项到 素材库/多个文件夹/`
- 带动作：`打开文件夹`

部分成功：

- `已导出 X / N 项，Y 项失败`
- 仍提供“打开文件夹”
- 只给成功项写 `exportedAt`

全部失败：

- `导出失败，请确保小红书或抖音页面可访问`
- 详情可使用 `resp.errors[0]`
- 不写 `exportedAt`

### 4.4 看板刷新

导出完成后：

1. 调 `loadItems()` 重新读取 storage。
2. `stats.exportedThisWeek` 自动重新聚合。
3. 清空选中态，避免用户误以为还在处理同一批。

## 5. 数据与消息契约

### 5.1 `types.ts`

扩展 `BATCH_DOWNLOAD` 单项 payload：

```ts
BATCH_DOWNLOAD: Array<{
  id?: string
  url: string
  filename: string
  platform?: Platform
}>
```

说明：

- `filename` 仍是相对路径，不含 `MEDIA_COLLECTOR_DIR` 前缀。
- `filename` 可为 `618选题/标题_01.jpg`。
- `id` 可选，兼容弹窗和旧调用方；有 `id` 才能写入 `exportedAt`。

扩展 `MessageResponse`：

```ts
export interface MessageResponse {
  success: boolean
  count?: number
  errors?: string[]
  folder?: string
  folders?: string[]
  exportedIds?: string[]
}
```

新增消息：

```ts
MessageType: "SHOW_DOWNLOADS_FOLDER"
MessagePayloads.SHOW_DOWNLOADS_FOLDER: void
```

后台响应该消息时调用：

```ts
chrome.downloads.showDefaultFolder()
```

### 5.2 `background/download.ts`

内部文件描述类型建议：

```ts
type DownloadFile = {
  id?: string
  url: string
  filename: string
  platform?: Platform
}
```

`batchDownload(files)` 返回：

```ts
Promise<{
  success: boolean
  count?: number
  errors?: string[]
  folder?: string
  folders?: string[]
  exportedIds?: string[]
}>
```

成功项判断以每个文件实际 download promise resolve 为准。

### 5.3 `background/storage.ts`

新增函数：

```ts
export function markItemsExported(ids: string[], exportedAt: string): Promise<{ success: boolean; updated: number }>
```

规则：

- 空数组直接返回 `{ success: true, updated: 0 }`。
- 必须走 `enqueueWrite()`。
- 只更新匹配 id 的素材。
- 不改变列表顺序。
- 保留其他字段。

## 6. 实施步骤

### Step 1：扩展类型契约

文件：`types.ts`

- 给 `BATCH_DOWNLOAD` item 加 `id?: string`。
- 给 `MessageResponse` 加 `folder?: string`、`folders?: string[]`、`exportedIds?: string[]`。
- 新增 `SHOW_DOWNLOADS_FOLDER` 消息类型和 payload。

验证：

- TypeScript 能识别新 payload。
- 旧调用方只传 `{ url, filename, platform }` 不报错。

### Step 2：新增导出标记存储函数

文件：`background/storage.ts`

- 新增 `markItemsExported(ids, exportedAt)`。
- 使用 `getItems()` 读取，`chrome.storage.local.set({ [STORAGE_KEY]: nextItems })` 写回。
- 包裹在 `enqueueWrite()` 内。

验证：

- 空 ids 不写 storage。
- ids 命中时只变更 `exportedAt`。
- 未命中 id 不产生错误。

### Step 3：改造下载后台

文件：`background/download.ts`

- 把 `fetchAndDownload(urls, filenames, platform)` 改为接收 `DownloadFile[]`。
- 每个文件按自身 `platform` 计算 Referer，而不是沿用第一项。
- 下载目标仍拼接 `MEDIA_COLLECTOR_DIR + "/" + file.filename`。
- 记录 `successfulIds`、`successfulFolders`、`errors`。
- 下载完成后调用 `markItemsExported(successfulIds, new Date().toISOString())`。
- 返回 `exportedIds`、`folder/folders` 给 UI。

验证：

- 单文件导出成功返回 `count: 1` 和对应 folder。
- 混合平台导出时每项使用自己的 Referer。
- 部分失败时只记录成功 id。
- 无 id 的调用方仍能下载，只是不更新 `exportedAt`。

### Step 4：接入打开下载文件夹

文件：`background/index.ts`

- `BATCH_DOWNLOAD` 继续调用 `batchDownload()`。
- 新增 `SHOW_DOWNLOADS_FOLDER` case：
  - 调 `chrome.downloads.showDefaultFolder()`。
  - `sendResponse({ success: true })`。
  - 捕获 `chrome.runtime.lastError`。

验证：

- 从库页 Toast 点击“打开文件夹”能打开 Chrome 下载文件夹。
- 若 API 不可用，UI 显示错误 Toast 或静默失败但不影响导出。

### Step 5：库页生成分文件夹路径

文件：`tabs/library.tsx`

新增/调整 helper：

- `sanitizePathSegment(value, fallback)`
- `resolveExportFolder(item)`
- `buildExportFilename(item)`
- `buildExportPath(item)`：返回 `<folder>/<filename>`
- `summarizeExportFolders(paths)`：用于 Toast 文案

`downloadItems(targets)` payload 改为：

```ts
payload: targets.map((item) => ({
  id: item.id,
  url: item.url,
  filename: buildExportPath(item),
  platform: item.platform,
}))
```

导出成功后：

- 使用 `resp.count ?? targets.length` 展示成功数量。
- 使用 `resp.folder` 或 `resp.folders` 展示目录。
- `actionLabel: "打开文件夹"`，`onAction` 发送 `SHOW_DOWNLOADS_FOLDER`。
- 调 `loadItems()` 刷新 `exportedAt`。
- `clearSelection()`。

验证：

- 在收藏夹 `618选题` 中导出，下载路径为 `media-collector/618选题/...`。
- 在“全部素材”中导出多收藏夹素材，能按各自收藏夹/作者分目录。
- 未分类素材导出到 `media-collector/未分类/...`。
- Toast 路径与实际下载路径一致。

### Step 6：弹窗兼容

文件：`popup.tsx`

最低要求：

- 不破坏现有批量导出。
- 可保持平铺导出到 `media-collector/`。

推荐小改：

- 给 `BATCH_DOWNLOAD` payload 补 `id: item.id`。
- 导出成功后如有必要重新 `loadItems()`，让以后弹窗也能感知 `exportedAt`。

不做：

- 不把收藏夹分目录逻辑搬进弹窗。
- 不新增弹窗“打开文件夹”复杂交互。

### Step 7：文档同步

文件：

- `AGENTS.md` 或项目可维护文档：补充 M4 导出路径、`SHOW_DOWNLOADS_FOLDER`、`markItemsExported()`。
- 如 `CLAUDE.md` / `DESIGN.md` 当前有旧下载说明，补一段“分文件夹导出”的最终约定。

验证：

- 文档与代码中的消息类型、路径规则一致。

## 7. 验证清单

构建验证：

```bash
pnpm build
```

手动 Chrome 验证：

1. 加载 `build/chrome-mv3-dev`。
2. 打开全屏素材库。
3. 新建收藏夹 `618选题`。
4. 选中几项素材加入该收藏夹。
5. 在 `618选题` 视图里导出选中素材。
6. 检查 Chrome 下载目录中存在 `media-collector/618选题/`。
7. 点击 Toast “打开文件夹”，确认能打开下载目录。
8. 返回库页，看板“本周已导出”数量增加。
9. 在“全部素材”导出混合收藏夹、未分类、不同作者素材，确认进入不同子目录。
10. 混合小红书/抖音素材导出，确认成功率不因 Referer 取第一项而下降。

回归验证：

1. 弹窗批量导出仍可用。
2. 单素材 hover 下载仍可用。
3. 删除/撤销不受影响。
4. 收藏夹创建/重命名/删除/加入/移出不受影响。
5. 预览、全选/取消全选不受影响。

## 8. 风险与处理

### 风险 1：多收藏夹素材导出目录不唯一

处理：当前收藏夹视图优先；否则按收藏夹列表顺序取第一个。该规则写入代码和文档，保证可解释。

### 风险 2：混合平台下载 Referer 错误

处理：M4 必须顺手修掉现有“取第一项 platform”的实现，逐项计算 Referer。

### 风险 3：导出成功但 `chrome.downloads.onChanged` 超时

现状已有 15 秒兜底 resolve。M4 暂不重写该机制，只在成功项记录上沿用当前 resolve 结果，避免扩大下载链路风险。

### 风险 4：用户取消下载或 Chrome 下载策略拦截

当前 `saveAs: false`，多数情况下不会弹框。若 Chrome 中断，记录 errors，Toast 显示部分失败，不写失败项 `exportedAt`。

### 风险 5：非法路径或过长路径

处理：UI 侧清洗路径段；后台可再做一次轻量防御，禁止绝对路径和 `..` 段。

## 9. 确认决策

切记按以下 4 点后再开始编码：

1. M4 v1 只在全屏素材库页做“分文件夹导出”，弹窗保持平铺导出
2. “全部素材”下，已归属多个收藏夹的素材按“收藏夹列表顺序第一个”导出“
3. Toast 的“打开文件夹”使用 `chrome.downloads.showDefaultFolder()` 打开默认下载目录
4. 下载根目录继续使用现有常量 `media-collector`，Toast 展示中文为 `素材库/<folder>/`

## 10. 推荐执行顺序

如果以上决策确认，建议按这个顺序落地：

1. 类型契约 + storage `markItemsExported()`。
2. background 下载改造和打开文件夹消息。
3. `tabs/library.tsx` 路径解析、Toast、刷新看板。
4. 弹窗兼容补 `id`。
5. 文档同步。
6. `pnpm build` + Chrome 手动验证。

