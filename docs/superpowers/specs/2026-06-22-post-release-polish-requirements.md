# 发布后首轮优化改进需求文档

**日期**: 2026-06-22  
**状态**: 审核决策已确认  
**阶段建议**: M8 发布后体验与一致性修复  
**适用版本**: 当前 `2.1.0` 代码基线  

## 1. 背景

Chrome 插件已于上周五发布第一版到 Chrome Web Store。当前公开定位已经收敛为“小红书素材采集与本地管理工具”,主入口是 `tabs/library.html` 全屏素材库,不再承诺 popup 或抖音采集。

本次检查基于当前代码、构建产物和发布文档完成,重点覆盖:

- 库页主题、导出、收藏夹、导出历史等用户高频路径
- 小红书采集缓存与下载链路的长期可靠性
- Chrome Web Store 发布范围、权限说明、文档承诺与真实行为一致性
- 现有测试能覆盖和不能覆盖的风险边界

已验证命令:

```bash
pnpm test
pnpm build
pnpm test:release-scope
pnpm audit:a11y
pnpm exec tsc --noEmit
pnpm package
```

以上全部通过。说明当前项目没有明显编译/构建/基础 a11y 断点,但仍存在若干发布后应尽快收口的行为一致性与边角数据问题。

## 2. 总目标

1. 修复用户可直接感知的交互错误:单项下载目录错误、导出历史不即时刷新、收藏夹移动计数异常,并将主题相关承诺收口为“深色主题优先”。
2. 收紧公开发布范围:右键菜单、权限、README、商店文案与“小红书当前发布版”保持一致。
3. 提高长期可靠性:下载完成状态真实可信,小红书浮层缓存淘汰符合“最近使用”语义。
4. 保持现有架构边界:不恢复 popup 主入口,不恢复列表页 hover 采集,不新增抖音承诺,不引入 offscreen / DNR 等更重权限方案。

## 3. 非目标

- 不重做视觉设计。
- 不引入虚拟滚动。
- 不恢复小红书信息流 hover 采集。
- 不恢复 Douyin content script 或相关商店承诺。
- 不把本地素材库改成云同步或账号体系。
- 不将本轮作为大规模 `LibraryPage` hook 拆分重构;若需要重构,应复用已有 library split spec 单独推进。

## 4. 优先级总览

| ID | 优先级 | 类型 | 需求 |
|---|---:|---|---|
| R1 | P0 | 用户体验 / 承诺一致性 | 深色主题优先,修正文档承诺并保留后续 light theme 空间 |
| R2 | P0 | 功能正确性 | 修复单卡片下载捕获旧收藏夹上下文 |
| R3 | P0 | 功能反馈 | 导出后立即刷新导出历史与失败角标 |
| R4 | P0 | 数据一致性 | 收藏夹移动去重,避免 `collectionIds` 重复 |
| R5 | P1 | 发布范围 / 审核 | 右键菜单按方案 A 收窄到小红书页面 |
| R6 | P1 | 采集可靠性 | `__mc_notes__` 缓存改成真正最近使用淘汰 |
| R7 | P1 | 下载可靠性 | 下载 15 秒兜底不再制造“假成功” |
| R8 | P1 | 文档一致性 | README / release docs / changelog 同步真实行为 |
| R9 | P2 | 权限最小化 | 复核 `activeTab` 等权限是否仍必要 |
| R10 | P2 | 反馈策略 | 导出完成保留系统通知,库页继续显示 Toast |

## 5. 详细需求

### R1: 深色主题优先,修正文档承诺

**问题**

当前 `lib/use-theme.tsx` 已实现 `auto / dark / light` 三态、系统偏好监听与 `chrome.storage.local[theme_mode]` 持久化,但库页入口传入 `<ThemeProvider initial="dark">`,导致 Provider 跳过 storage 读取并固定深色主题。同时项目里没有任何 `useThemeControl()` / `cycleMode()` 调用,顶栏主题切换按钮不存在。

此外 `lib/library-styles.ts` 中仍有大量深色硬编码,如 sidebar、main、dialog 背景和白色文字。即使放开 Provider,light theme 也会呈现半黑半亮的不完整状态。

**审核结论**

本轮不要求一次性做到 light theme 完整可用,先把公开文档和发布验证项改成“深色主题优先”。light theme / auto / 三态切换作为后续独立优化项保留,不要在当前发布文案中继续承诺已经完成。

**需求**

- README / release checklist / store listing / CHANGELOG 中不得继续声明“light 主题 + 跟随系统 + 顶栏主题切换 UI”已在当前发布版完整可用。
- README 的手动验证项移除“主题切换”,或明确标注“当前以深色主题为主”。
- `lib/use-theme.tsx` 和 `lib/design-tokens.ts` 可保留,但文档应说明它们是后续 light theme 的基础设施,不是当前用户可见承诺。
- 若本轮不实现主题按钮,库页无需暴露半成品 light theme。
- 若后续重新推进 light theme,需另开实现计划,一次性处理 Provider 接入、顶栏按钮、样式 token 化和 a11y 验收。

**验收标准**

- 当前发布文档不再承诺用户可切换 light/auto 主题。
- README 手动验证清单与真实 UI 一致。
- 当前深色主题 UI 行为不变。
- `pnpm audit:a11y` 通过。

**测试建议**

- `rg "主题切换|light 主题|跟随系统|auto / dark / light"` 检查发布文档中是否仍有不实承诺。
- 手动确认库页顶栏不存在文档声称的主题按钮。
- 保留现有 `pnpm audit:a11y` 深色主题审计。

---

### R2: 修复单卡片下载捕获旧收藏夹上下文

**问题**

库页 `handleDownloadOne` 使用空依赖 `useCallback`,内部调用首次 render 的 `downloadItems([item])`。而 `downloadItems` 会读取当前 `collectionFilter` 和 `collections` 来生成导出路径。结果是用户切换收藏夹、创建/重命名收藏夹后,卡片 hover 小按钮“下载该素材”可能仍使用旧上下文,导出到错误目录。

批量导出按钮直接调用当前 render 的 `downloadItems(selectedItems)`,不受该问题影响。

**需求**

- `handleDownloadOne` 必须使用当前 `collectionFilter` 与 `collections`。
- 可以选择:
  - 给 `useCallback` 补完整依赖;或
  - 使用 ref 保存最新导出上下文,保持 callback 稳定但读取最新值。
- 若选择补依赖,需要评估 `LibraryCell memo` 的收益变化;正确性优先于 memo 命中率。

**验收标准**

- 在收藏夹 A 视图点击单卡片下载,文件路径为 `media-collector/A/<文件名>`。
- 切换到收藏夹 B 后点击同一入口,文件路径为 `media-collector/B/<文件名>`。
- 重命名收藏夹后不刷新页面,单卡片下载使用新收藏夹名。
- 批量导出行为保持不变。

**测试建议**

- 增加导出 payload 构造的单测或组件级 mock 测试。
- 手动在库页选择不同收藏夹,用 Chrome 下载记录确认 filename 路径。

---

### R3: 导出后立即刷新导出历史与失败角标

**问题**

后台 `batchDownload()` 每次都会写入导出历史,但库页普通导出成功后只调用 `loadItems()`,未调用 `loadHistory()`。因此 toolbar 上“导出历史”数量和失败角标不会立即更新,用户需要点开导出历史或刷新页面才能看到新状态。

重试失败项路径已经在回调里调用 `loadHistory()`,普通导出路径缺失。

**需求**

- 普通 `BATCH_DOWNLOAD` 回调完成后,无论成功、部分成功、全失败,只要后台返回或可能写入 history,库页都应刷新导出历史。
- 若响应里带 `history`,可以选择直接 prepend 到本地 `history` state,但仍需与 storage 保持一致。
- 部分失败时失败角标应立即增加。
- 全失败也应在导出历史中可见,并支持失败项重试。

**验收标准**

- 成功导出 1 次后,toolbar 导出历史数量立即 +1。
- 部分失败后,失败角标立即显示或更新。
- 全失败后,导出历史 modal 立即能看到失败记录。
- 清空历史后再导出,数量从 0 正确增长。

**测试建议**

- 在 `scripts/a11y-audit.mjs` 或新 harness 中 mock `BATCH_DOWNLOAD` 返回 history,验证按钮文本/角标刷新。
- 手动断网或使用失败 URL 注入样本,验证失败历史。

---

### R4: 收藏夹移动去重

**问题**

`moveCollectionItems()` 从源收藏夹移除后直接 `push(toCollectionId)`。如果素材原本已经同时属于源收藏夹和目标收藏夹,移动后会出现重复 id,例如 `["B", "B"]`。后续 `collectionCounts` 会按数组逐项计数,导致收藏夹数量虚高。

**需求**

- 后台 `moveCollectionItems()` 写入 `collectionIds` 时必须去重。
- UI 在收藏夹视图打开“移动到...”时,建议隐藏或禁用当前收藏夹选项,避免用户移动到自身。
- 后台仍需保留 `fromCollectionId === toCollectionId` 防线,不能只依赖 UI。
- 可顺手增加一次旧数据清理策略:加载或迁移时对 `MediaItem.collectionIds` 去重。若风险较大,可单独延后。

**验收标准**

- 素材 `collectionIds = ["A", "B"]`,在 A 视图移动到 B 后,结果为 `["B"]`。
- 收藏夹 B 计数不会因重复 id 虚高。
- 移动到当前收藏夹不会产生错误数据;UI 不让用户选择当前收藏夹或给出清晰反馈。
- `assignCollection()` 现有 Set 去重行为保持不变。

**测试建议**

- 给 `background/collections.ts` 增加 `moveCollectionItems` 单测:
  - 普通 A → B
  - 已属于 B 的 A → B
  - from/to 相同
  - 目标收藏夹不存在

---

### R5: 右键菜单收敛到公开发布范围

**问题**

当前右键菜单在所有网页图片/视频上可见。非小红书页面右键采集会以 `unknown` 平台入库,但当前公开版只承诺小红书,库页平台筛选也只展示小红书。这会造成:

- 用户误以为扩展支持任意网页素材采集。
- 商店权限说明与真实行为不完全一致。
- `unknown` 数据在库页缺少清晰管理入口。

**需求**

**审核结论:采用方案 A。** 当前发布版右键菜单收窄到小红书页面,不保留通用右键采集承诺。

- 创建 context menu 时加小红书页面限制,仅在 `https://www.xiaohongshu.com/*` 页面显示。
- onClicked 中继续保留非 XHS 防线:若 `tab.url` 不是小红书,不入库并给轻量提示。
- README / 商店文案保持“当前发布版仅承诺小红书”。

**验收标准**

- 非小红书页面右键图片/视频不显示“采集此素材”菜单。
- 若通过异常路径触发非 XHS 采集,后台不会写入 `unknown` 素材。
- Chrome Web Store listing 与 README 无“泛网页采集”的暗示。

**测试建议**

- 加 `test:release-scope` 检查 context menu 配置或代码中存在 XHS 限制。
- 手动在普通网页和小红书页面分别右键图片验证。

---

### R6: `__mc_notes__` 改成真正最近使用淘汰

**问题**

文档称 `localStorage.__mc_notes__` 是 LRU,上限 200,保留最新 150。但当前实现更新已有 note 时没有刷新 key 顺序,淘汰时按 `Object.keys(cache)` 前段删除。老 note 即使被用户重新打开,仍可能按旧插入顺序被删除。

**需求**

- 在 `stateInjector()` 内保持自包含约束的前提下,让缓存淘汰符合“最近写入/最近使用”。
- 简单方案:
  - 写入 `cache[n.id]` 前先 `delete cache[n.id]`,再重新赋值,借助对象 key 顺序刷新 recency。
- 更明确方案:
  - 每条缓存附加 `_updatedAt` 或维护单独 order,淘汰时按时间排序。
- 不得破坏 `getNoteMediaFromState(noteId)` 读取结构;如果结构变更,需兼容旧缓存。

**验收标准**

- 已存在 note 被再次拦截后,其淘汰顺序更新为最新。
- 缓存超过 200 后保留最近 150 条。
- 旧格式 `cache[noteId] = media` 仍可读取。
- `stateInjector` 仍是自包含函数,不能引用外部变量或 helper。

**测试建议**

- 抽出一份纯逻辑 helper 做同构测试,再将逻辑内联/同步到 `stateInjector`;或使用字符串/函数执行方式测试注入函数。
- 覆盖:
  - 新增超过 200
  - 已有 key 重写刷新顺序
  - 旧缓存结构兼容

---

### R7: 下载完成状态必须真实可信

**问题**

当前 `downloadOne()` 在 `chrome.downloads.onChanged` 未触发时,15 秒后直接 `resolve()`。这可以避免队列卡死,但会把“仍在下载 / 下载状态未知”标记为成功,随后写入 `exportedAt` 和导出历史成功记录。慢网络或浏览器下载后续中断时,用户会看到“已导出”,但文件可能不存在或不完整。

**需求**

- 15 秒兜底不应无条件成功。
- 超时后应调用 `chrome.downloads.search({ id: downloadId })` 检查真实状态:
  - `complete`: resolve
  - `interrupted`: reject
  - `in_progress` 或查不到: 可继续等待一段有限时间,或 reject 为“下载超时,请在导出历史中重试”
- 只有确认 complete 的文件才能计入 `successfulIds`,并写 `exportedAt`。
- 错误原因应进入 `failedFiles.error`,供导出历史重试。

**验收标准**

- 正常下载完成仍标记成功。
- 下载中断时返回失败,不会写 `exportedAt`。
- 下载超时/状态未知不会被当成成功。
- 下载超时用户文案使用“下载超时,请在导出历史中重试”。
- 部分成功时 Toast、系统通知、导出历史数量一致。

**测试建议**

- 给 `background/download.ts` 增加 chrome.downloads mock 单测:
  - onChanged complete
  - onChanged interrupted
  - onChanged 不触发但 search complete
  - onChanged 不触发且 search in_progress/空结果

---

### R8: 文档一致性修复

**问题**

当前 README 和部分说明仍有旧描述:

- `README.md` 项目结构中提到 `base.ts` 有 HoverUIManager / 下载工具遗留,但源码已经清理。
- README 说导出后 Toast 可“一键打开文件夹”,但实际 `chrome.downloads.showDefaultFolder()` 只能打开默认下载目录,用户还需进入 `media-collector/<folder>/`。
- README 手动验证列出“主题切换”,但当前 UI 没入口。
- 文档多处提到 light theme 已完成,但库页实际固定 dark。

**需求**

- README / CHANGELOG Unreleased / release checklist / store listing 与真实行为同步。
- 用词统一:
  - “打开下载目录”优先于“打开文件夹”。
  - 当前发布版只说小红书,不暗示 Douyin 或泛网页采集。
  - popup 不作为主入口。
- 若 R1/R5 修复后再同步文档,文档应描述修复后的行为;若暂不修复,文档必须诚实描述当前限制。

**验收标准**

- `rg "HoverUIManager|打开文件夹|popup 主入口|抖音|Douyin"` 不再命中运行时不一致的发布文案。
- README 的手动验证项全部在当前 UI 中存在。
- 商店权限说明能解释实际权限用途。

**测试建议**

- 扩展 `scripts/test-release-scope.mjs`,加入发布文案关键词检查。

---

### R9: 权限最小化复核

**问题**

Manifest 仍声明 `activeTab`。当前核心路径中:

- 小红书 content script 由 host permission 注入。
- MAIN world 注入使用 `scripting` + XHS host permission。
- 打开库页使用 `tabs`。
- 快捷键采集通过 `tabs.query` + `tabs.sendMessage`。

需要确认 `activeTab` 是否仍有实际必要。如果没有,移除可降低审核解释成本。

**需求**

- 逐项复核 manifest permissions 的真实调用点。
- 若 `activeTab` 无调用必要,移除并同步 docs/release 权限说明。
- 若保留,文档必须说明它具体服务哪个用户动作。

**验收标准**

- manifest 权限与代码调用点一一对应。
- Chrome Web Store 权限说明无空泛描述。
- `pnpm test:release-scope` 覆盖权限范围断言。

---

### R10: 导出完成保留系统通知

**问题**

库页导出会显示底部 Toast,后台 `batchDownload()` 也会调用系统通知。对于用户在库页主动点击导出这一场景,双重反馈可能偏吵。采集场景的系统通知仍有价值,因为用户可能不在库页。

**审核结论**

导出完成后保留系统通知。库页主动导出场景继续同时展示底部 Toast,用于给出路径、失败数量和“打开下载目录”等操作反馈;系统通知作为跨页面完成提醒保留。

**需求**

- 不新增 `silent?: boolean` 或调用来源字段。
- `BATCH_DOWNLOAD` 保持后台系统通知。
- 库页导出继续显示 Toast,用于即时展示导出结果、失败数量和下载目录入口。
- README / release docs 如描述导出反馈,需说明“导出完成会有系统通知,库页内也会显示 Toast”。

**验收标准**

- 用户主动在库页操作导出时,能看到库页 Toast。
- 导出完成后系统通知仍正常出现。
- 系统通知与库页 Toast 文案不互相矛盾。
- 内容脚本采集仍能给用户明确成功/失败反馈。

## 6. 建议实施顺序

### 第一批: 高确定性 P0 修复

1. R2 单卡片下载上下文
2. R3 导出历史即时刷新
3. R4 收藏夹移动去重

这三项修改范围小、风险低、能直接提升用户体验。建议优先完成并补单测。

### 第二批: 发布一致性

1. R1 深色主题优先的文档承诺收口
2. R5 右键菜单范围
3. R8 文档一致性
4. R9 权限最小化复核

这批面向 Chrome Web Store 审核和用户预期管理,建议在下一次商店版本提交前完成。

### 第三批: 可靠性修复

1. R6 `__mc_notes__` LRU
2. R7 下载真实完成状态

这批需要更细测试,尤其 R7 要 mock Chrome downloads API,建议在 P0/P1 发布一致性完成后推进。

### 第四批: 反馈策略文档同步

1. R10 导出完成系统通知策略

R10 已确认保留系统通知。代码行为当前无需改为 silent 模式,只需在发布文档中保持描述一致。

## 7. 测试与验收总计划

每批完成后至少跑:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
pnpm test:release-scope
pnpm audit:a11y
```

发布前再跑:

```bash
pnpm package
```

手动回归清单:

- 小红书首页浮层采集图片笔记
- 小红书首页浮层采集视频笔记
- 小红书独立详情页采集
- 快捷键采集
- 库页加载、搜索、平台筛选、类型筛选、排序、视图切换
- 单卡片下载、批量导出、部分失败重试
- 导出历史数量、失败角标、清空历史
- 收藏夹创建、重命名、改色、置顶、加入、移动、移出、删除
- 删除素材与撤销
- 深色主题库页刷新后交互无异常,并确认发布文档未承诺主题切换
- 非小红书网页右键菜单范围

## 8. 风险与注意事项

- `stateInjector` 必须保持自包含,不得引用外部 helper。
- `contents/*.ts` 会自动成为 content script,新增 helper 不得放在 `contents/`。
- 不要恢复旧 popup 主入口或列表页 hover 采集。
- storage 写入继续走 `enqueueWrite()`。
- 下载链路不要为了本轮修复引入更重权限;先在现有 SW download 架构内修正完成状态。
- 本轮主题只做“深色主题优先”的发布承诺收口;若后续推进 light/auto,需单独处理 Provider 接入、顶栏按钮、样式 token 化和 a11y 验收。

## 9. 审核确认结论

已确认:

- R5 右键菜单按方案 A 收窄到小红书页面。
- R1 本轮先把文档改成“深色主题优先”,不承诺 light theme 完整可用。
- R10 导出完成后保留系统通知,库页继续显示 Toast。
- R7 下载超时文案使用“下载超时,请在导出历史中重试”。

建议下一步为第一批 P0 修复单独生成实现计划,再进入代码修改。
