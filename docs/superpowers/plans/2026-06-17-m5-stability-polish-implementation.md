# M5 稳定性与体验打磨实施计划

> 状态：待复核确认  
> 建议分支：`feat/m5-stability-polish-20260617`  
> 基线：`main` `66afd81`（`merge: m4 分文件夹导出 + 导出反馈 Toast`），本地 `main` 已与 `origin/main` 对齐。执行前先确认当前工作区已有改动是否属于用户正在进行的工作，M5 提交不要混入无关文件。  
> 方法：按 `$superpowers:using-superpowers` 先规划、再执行；执行本计划时建议逐 task 勾选，完成后统一交给用户 Chrome 验收，再 commit。

## 1. 目标

M1-M4 已完成从采集到收藏夹、全屏素材库、分文件夹导出的主链路。M5 不继续扩功能，而是把现有能力打磨到“长期可用”的稳定状态：

1. 批量选择、筛选切换、导出/删除/加入收藏夹的状态一致，不出现隐藏选中项、计数失真、误操作。
2. 空状态、失败状态、部分成功状态更清晰，用户知道当前发生了什么。
3. 键盘、焦点、弹窗/对话框、预览等基础 a11y 行为可靠。
4. 视觉语言回到同一套 Apple Liquid Glass 规范：字重、圆角、阴影、动效、focus ring 统一。
5. 在 100+ 素材下，库页搜索、筛选、预览、批量操作保持顺滑。
6. 建立 M5 验收清单，后续每次改 UI 都能复用。

## 2. 非目标

- 不新增付费门控、云同步、导出历史、ZIP 打包。
- 不改 XHS MAIN-world 注入链路，不改采集策略。
- 不重新引入小红书列表页 hover 采集。
- 不做大规模组件拆分或设计系统重写。
- 不引入新 UI 框架、CSS Modules、Tailwind。
- 不把 M5 扩成虚拟滚动项目；只有真实压力验证证明卡顿时才做轻量处理。

## 3. 当前状态观察

已具备：

- `tabs/library.tsx` 已有全屏素材库、看板、筛选、网格/列表、全选、预览、收藏夹操作、分文件夹导出 Toast。
- `background/download.ts` 已支持逐项 platform Referer、子目录文件名、`exportedAt` 回写、路径穿越防御。
- `popup.tsx` 已有密集弹窗、主题切换、搜索、批量操作、预览。
- `scripts/a11y-audit.mjs` 已有 popup 的 axe-core 审计脚本。

需要 M5 收口：

- 库页选择状态虽然已有筛选变化清空逻辑，但还需要补齐 `items` 变化后的 stale id 清理、批量操作只作用于当前有效 item 的防线。
- Toast 文案中“打开文件夹”实际是 `chrome.downloads.showDefaultFolder()`，更准确应为“打开下载目录”。
- 空状态目前偏简单，库页“无素材”和“筛选无结果”没有区分。
- 多处 UI 仍有 `fontWeight: 500`、普通按钮/卡片阴影、局部 magic color，需要按设计文档的受控偏离边界收敛。
- a11y 覆盖主要在 popup，库页和对话框还缺专项审计。
- 响应式边界没有系统验收，尤其是库页顶部 toolbar / subbar / bulk 操作区在窄宽下的换行与溢出。

## 4. 设计原则

### 4.1 稳定性优先

M5 的每个改动都要能回答：“它减少了哪一种误操作或不确定性？”如果只是视觉偏好，放到低优先级。

### 4.2 小步闭环

每个 task 完成后都跑：

```bash
pnpm build
```

涉及可访问性时额外跑：

```bash
pnpm audit:a11y
```

### 4.3 不扩大数据模型

M5 不新增 storage key，不新增后台 CRUD。除非修复下载/选择状态的安全问题，否则不碰 background。

### 4.4 继续遵守项目硬约束

- Inline styles only。
- 所有 storage 写入走 `enqueueWrite()`。
- 下载仍走 background service worker。
- UI 文案全部简体中文。
- 不触碰 XHS `document_start` / MAIN-world 注入。

## 5. 实施任务

### Task 0：开 M5 分支与工作区清理

**目标**：M5 改动独立，避免混入用户已有改动或系统缓存文件。

- [ ] 从 `main` 拉分支：

```bash
git checkout main
git pull --ff-only
git checkout -b feat/m5-stability-polish-20260617
```

- [ ] 执行前检查 `git status --short`：
  - 若有用户正在进行的改动，先确认是否继续沿用、单独提交、stash，或留在工作区不触碰。
  - 若有 `.DS_Store` / `.codegraph/` 等系统缓存文件，确保不要混入 M5 业务提交。
- [ ] 记录基线：`git log --oneline -1` 应为 `66afd81` 或其后用户明确认可的提交。

**验收**：

- `git status --short` 只显示 M5 相关改动。

### Task 1：批量选择与筛选状态安全

**文件**：`tabs/library.tsx`

**目标**：任何批量操作只作用于用户当前可理解、当前有效的选中素材。

- [ ] 确认筛选变化清空选中态覆盖这些状态：
  - `scope`
  - `platformFilter`
  - `collectionFilter`
  - `typeFilter`
  - `search`
- [ ] 增加 `items` 变化后的 stale selection 清理：

```ts
useEffect(() => {
  setSelectedIds((prev) => {
    if (prev.size === 0) return prev
    const validIds = new Set(items.map((item) => item.id))
    const next = new Set([...prev].filter((id) => validIds.has(id)))
    return next.size === prev.size ? prev : next
  })
}, [items])
```

- [ ] 将批量操作入口统一基于“当前有效选中项”，避免未来改动绕过筛选清空逻辑：
  - `selectedItems` 至少要保证 id 存在于 `items`。
  - 如决定更严格，则新增 `visibleSelectedItems = sortedItems.filter(...)`，批量导出/删除/加入收藏夹使用它。
- [ ] `selectedCount` 与实际批量目标保持一致。
- [ ] 切换收藏夹、平台、类型、搜索后，“已选 N 项”必须归零。
- [ ] 删除、导出、加入收藏夹成功后继续清空选中态。

**手动验收**：

1. 在“全部素材”选中 A。
2. 切到某收藏夹或平台筛选。
3. 确认已选数量归零，导出按钮禁用。
4. 搜索关键词后确认旧选择不会保留。
5. 删除一项后刷新列表，确认没有 stale 计数。

### Task 2：导出反馈与错误文案收口

**文件**：`tabs/library.tsx`、必要时 `background/index.ts`

**目标**：Toast 文案准确，和真实 API 行为一致。

- [ ] 将库页导出 Toast action label 从“打开文件夹”改为“打开下载目录”。
- [ ] Toast 成功文案保持：
  - 单目录：`已导出 N 项到 素材库/<folder>/`
  - 多目录：`已导出 N 项到 素材库/多个文件夹/`
- [ ] 部分成功文案补足目标目录信息：
  - 推荐：`已导出 X / N 项到 素材库/<folder>/，Y 项失败`
  - 多目录：`已导出 X / N 项到 素材库/多个文件夹/，Y 项失败`
- [ ] `SHOW_DOWNLOADS_FOLDER` 失败时给轻量错误反馈：
  - `无法打开下载目录，请在 Chrome 下载记录中查看`
- [ ] 确认 `chrome.downloads.showDefaultFolder()` 只承诺打开默认下载目录，不承诺定位到子文件夹。
- [ ] 下载失败 Toast 使用中文逗号，文案统一为：`导出失败，请确保小红书或抖音页面可访问`。

**验收**：

- 单收藏夹导出 Toast 正确显示收藏夹名。
- 多目录导出显示“多个文件夹”。
- 部分失败不误报全部成功。
- 点击 action 打开默认下载目录。

### Task 3：空状态与无结果状态

**文件**：`tabs/library.tsx`，可复用/扩展 `components/EmptyState.tsx`

**目标**：区分“还没有素材”和“筛选没有结果”，避免用户误判数据丢失。

- [ ] 新增库页空状态分支：
  - `items.length === 0`：展示“还没有采集素材”。
  - `items.length > 0 && sortedItems.length === 0`：展示“没有匹配的素材”。
- [ ] 无结果状态提供低干扰操作：
  - 清空搜索/筛选。
  - 如在收藏夹视图，可显示“当前收藏夹暂无匹配素材”。
- [ ] 空收藏夹状态与全局无素材状态区分。
- [ ] 文案不做教程式堆叠，保持工作台感，避免长段说明。
- [ ] 空状态视觉使用现有 token：
  - `theme.card`
  - `theme.hairlineSoft`
  - `theme.r.md` 或 `theme.r.lg`
  - 不新增装饰性渐变。

**验收**：

- 清空所有素材时，库页不是只有一行“没有匹配的素材”。
- 有素材但筛选无结果时，能一键清空筛选。
- 收藏夹为空时，用户知道是当前收藏夹为空，不是素材库为空。

### Task 4：键盘与 a11y 收口

**文件**：`tabs/library.tsx`、`components/PreviewModal.tsx`、`components/Toast.tsx`、`scripts/a11y-audit.mjs`

**目标**：关键路径键盘可达，焦点不迷路，自动审计覆盖 popup 和 library。

- [ ] 对库页快捷键做最小补齐：
  - `Cmd/Ctrl+K` 聚焦搜索。
  - `Esc` 在搜索框内清空并 blur。
  - `Esc` 在对话框打开时关闭对话框。
  - `Esc` 在预览打开时关闭预览。
- [ ] `CollectionDialog` 打开时：
  - create/rename 输入框自动 focus。
  - `Enter` 提交创建/保存。
  - `Esc` 关闭。
- [ ] 将侧栏收藏夹“改/删”从 `span role="button"` 改为真实 `button`，减少键盘和 screen reader 风险。
- [ ] 库页列表行补齐键盘激活：
  - `role="button"` 或使用真实 button 包裹主要交互。
  - `Enter/Space` 可选择。
- [ ] Toast action 使用真实 button，并保留 `aria-live="polite"`。
- [ ] 扩展 `scripts/a11y-audit.mjs`：
  - 保留 popup 审计。
  - 增加 library page harness，mock `GET_ITEMS`、`GET_COLLECTIONS`、`BATCH_DOWNLOAD`、`SHOW_DOWNLOADS_FOLDER`、收藏夹消息。
  - 报告中区分 `popup` 与 `library`。
- [ ] 修复 axe 报告中的可处理违规；外部资源/图片加载类限制可记录为已知限制。

**验收**：

```bash
pnpm build
pnpm audit:a11y
```

- 审计报告无高优先级可处理违规。
- Tab 能进入搜索、筛选、批量按钮、网格卡片、对话框按钮。
- 对话框关闭后不会出现明显焦点丢失。

### Task 5：视觉一致性与 Apple 规范收敛

**文件**：`popup.tsx`、`tabs/library.tsx`、`components/*.tsx`、`lib/design-tokens.ts`

**目标**：减少“像不同阶段拼起来”的感觉，让主界面保持统一。

- [ ] 清理高频界面的 `fontWeight: 500`：
  - 正文/次要信息用 `400`。
  - 按钮/标签/强调用 `600`。
  - 大数字/品牌标题可保留 `700`，但不要扩散。
- [ ] 检查普通卡片/按钮阴影：
  - 普通 grid cell、dashboard card、toolbar button 不依赖阴影建立层级。
  - 浮动 Toast、modal、float bar 可保留 `theme.shadowFloat`。
  - Hero/封面图可保留受控阴影。
- [ ] 选中态统一：
  - 网格卡片：蓝色 ring/frame，不改变背景，不额外加阴影。
  - 列表行：`borderColor: theme.accent` + 轻背景即可。
- [ ] 微交互统一：
  - 按钮 active `scale(0.95)`。
  - hover 只做轻微 surface change 或小幅 translate。
  - 不新增 bouncing/夸张动效。
- [ ] 圆角统一：
  - 工具按钮 `theme.r.sm`。
  - 网格卡片/弹窗控件 `theme.r.md`。
  - 大浮层/空状态容器 `theme.r.lg`。
  - chip/search 使用 `theme.r.pill`。
- [ ] 扫描硬编码颜色，优先把高频 UI 改为 `theme.*`：

```bash
rg -n "rgba\\(|#[0-9a-fA-F]{3,8}|fontWeight: 500|boxShadow" popup.tsx tabs/library.tsx components lib/design-tokens.ts
```

说明：不要求一次清零所有命中，M5 只处理 popup/library 主路径和明显违背规范的点。

**验收**：

- 暗色主题下 popup/library 不出现突兀的不同蓝色、不同圆角、不同阴影语言。
- `fontWeight: 500` 在用户可见 UI 主路径基本清除。
- 普通按钮没有阴影堆叠感。

### Task 6：响应式与布局边界

**文件**：`tabs/library.tsx`、`popup.tsx`

**目标**：常见宽度下文字不挤压、按钮不重叠、批量条不溢出。

- [ ] 库页 viewport 验收宽度：
  - 1024 × 768
  - 1280 × 800
  - 1440 × 900
  - 1728 × 1117
- [ ] 检查 toolbar：
  - 标题、搜索框、排序、视图切换不重叠。
  - 搜索框有合理 `minWidth` / `maxWidth`。
- [ ] 检查 subbar / bulk 操作区：
  - `全部 / 小红书 / 抖音 / 图片 / 视频` 与“全选、加入收藏夹、导出、删除”不重叠。
  - 窄宽时允许换行或把批量操作移到下一行。
- [ ] Dashboard 4 卡在 1024 宽度下不挤爆文字。
- [ ] 网格最小列宽保持 150px 左右，不出现过窄卡片。
- [ ] Popup 460×660 下：
  - 顶栏按钮不挤压标题。
  - 搜索态不遮挡筛选/内容。
  - FloatBar 不遮住 Toast 或关键内容。

**验收**：

- 用 Chrome 或 Browser 截图逐宽度检查。
- 没有按钮文本被截断到不可理解。
- 没有批量区与筛选 chip 重叠。

### Task 7：100+ 素材压力验证与轻量优化

**文件**：优先 `tabs/library.tsx`，必要时增加本地 mock/harness

**目标**：验证真实使用量下的搜索、筛选、滚动体验。

- [ ] 准备 100+ 条素材数据：
  - 可用真实采集数据。
  - 或临时通过 DevTools / mock storage 注入，注意不要提交临时脚本。
- [ ] 验证：
  - 首次打开库页耗时可接受。
  - 搜索输入不卡顿。
  - 平台/类型/收藏夹切换不卡顿。
  - 网格滚动不卡顿。
  - 预览打开/关闭不卡顿。
- [ ] 如出现明显卡顿，只做轻量优化：
  - 避免重复 `new Date()` 计算。
  - 避免重复全量排序。
  - 给昂贵聚合补 `useMemo` 依赖。
  - 暂不引入虚拟滚动，除非 300+ 素材已明显不可用。

**验收**：

- 100+ 素材下库页主要操作无明显卡顿。
- 没有为了性能引入复杂新架构。

### Task 8：回归验证与文档同步

**文件**：`README.md`、`AGENTS.md`、`CLAUDE.md`、必要时 `docs/superpowers/plans/*.md`

**目标**：M5 的行为约定写入长期维护文档。

- [ ] 更新文档：
  - 库页选择状态规则。
  - Toast “打开下载目录”语义。
  - a11y 审计覆盖 popup + library。
  - M5 验收命令。
- [ ] 运行：

```bash
pnpm build
pnpm audit:a11y
```

- [ ] Chrome 手动回归：
  - 采集素材。
  - 打开 popup。
  - 打开全屏素材库。
  - 搜索/筛选/收藏夹切换。
  - 选中/全选/取消全选。
  - 加入收藏夹/移出收藏夹。
  - 预览图片/视频。
  - 分文件夹导出。
  - 删除 + 撤销。
  - 主题切换。
- [ ] 用户验收通过后再 commit。

## 6. 验收清单

### 构建

```bash
pnpm build
```

预期：Plasmo build 成功。

### 可访问性

```bash
pnpm audit:a11y
```

预期：

- popup 与 library 均生成审计结果。
- 无高优先级可处理违规。

### 手动体验

- 切筛选后不会保留隐藏选中项。
- 导出成功 Toast 路径正确。
- “打开下载目录”不误导为打开具体子文件夹。
- 空素材、空收藏夹、筛选无结果三种状态能区分。
- 键盘能完成搜索、选择、预览关闭、对话框关闭。
- 1024 宽度下库页不重叠。
- 100+ 素材下搜索/筛选/滚动可用。

## 7. 风险与处理

### 风险 1：视觉收敛过度导致返工

处理：M5 不重做视觉，只修明显不一致。普通按钮/卡片阴影、`fontWeight: 500`、Toast 文案这类确定问题优先。

### 风险 2：a11y 改造牵出大组件重构

处理：优先用真实 `button`、`aria-label`、键盘 handler、focus 管理解决。不要为了 a11y 大拆组件。

### 风险 3：压力验证诱导过早虚拟滚动

处理：先测 100+；只有真实卡顿才优化。虚拟滚动列为 M6 候选，不在 M5 默认执行。

### 风险 4：清理 `.DS_Store` 影响历史追踪

处理：单独处理或单独 commit，不混入 M5 业务 commit。若不确定，先只避免 stage。

## 8. 推荐执行顺序

1. Task 0：开分支，隔离 `.DS_Store`。
2. Task 1：批量选择安全。
3. Task 2：导出 Toast 文案。
4. Task 3：空状态。
5. Task 4：键盘/a11y + audit 脚本扩展。
6. Task 5：视觉一致性。
7. Task 6：响应式。
8. Task 7：100+ 压力验证。
9. Task 8：文档同步 + 全量回归。

## 9. 暂不纳入 M5 的后续候选

- M6：虚拟滚动 / 分页渲染。
- M6：导出历史与失败重试。
- M6：收藏夹颜色编辑与批量移动增强。
- M6：更完整的快捷键体系。
- M6：Pro 门控与升级流程。
