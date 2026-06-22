# Changelog

All notable changes to this project will be documented in this file.

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

暂无。

## [2.1.1] - 2026-06-22

### 变更

- **M8 发布后收口**:右键菜单仅在小红书页面展示,移除 `activeTab`,导出完成保留系统通知与库页 Toast,文档收口为“深色主题优先”。
- **发布收口(M7)**:公开定位收敛为“小红书素材采集与本地管理工具”;抖音采集暂不作为当前发布承诺,后续根据用户反馈评估。
- **权限最小化(M7)**:发布版移除 Douyin host permission 和 Douyin content script,降低 Chrome Web Store 审核解释成本。
- **文档一致性(M7)**:README / AGENTS / 商店文案 / 隐私说明同步当前 action 点击直达全屏素材库的架构。
- **运行态平台收敛**:类型、主题 token、素材库筛选、测试样本统一收敛为小红书/未知来源,避免当前发布版 UI 暗示多平台支持。

## [2.1.0] - 2026-06-17

M6 大素材量效率增强:大列表性能优化、收藏夹管理、导出历史、快捷键补齐、React.memo 性能优化。

### 新增

- **大列表性能**(M6.1):渐进渲染(`INITIAL_RENDER_COUNT=160`,滚动追加 120)+ React.memo 包裹 + 预计算字段(`enrichedItems` 一次性派生 `collectedAtMs` / `timeBucket` / `searchHaystack`)
- **导出历史**(M6.2):`EXPORT_HISTORY_KEY` 新 storage key,LRU 50 条,`GET_EXPORT_HISTORY` / `CLEAR_EXPORT_HISTORY` / `RETRY_EXPORT_FAILED` 消息,toolbar 按钮 + modal,显示最近 10 条 + 失败项重试
- **收藏夹管理**(M6.3):`Collection` 加 `sortOrder` / `pinned` / `color`,侧栏按 pinned → sortOrder → createdAt 倒序排序,`UPDATE_COLLECTION_COLOR` / `REORDER_COLLECTIONS` / `PIN_COLLECTION` / `MOVE_COLLECTION_ITEMS` 消息,编辑收藏夹 dialog(置顶 toggle),批量"移动到..."(从源移除并加入目标)
- **库页快捷键**(M6.4):Cmd/Ctrl+A 全选(输入态不拦截)、Delete/Backspace 删除(走撤销 Toast,输入态不拦截)、E 导出(非输入态)、C 加入收藏夹 dialog(非输入态),`scripts/test-keyboard-shortcuts.mjs` 手动 e2e 验证脚本(12 项断言)
- **大素材量 UX**(M6.1):subbar 计数 `已显示 X / N 项` / `共 N 项`,section header 显示 `今天 · 80 项 已显示 80 / 80`,筛选无结果显示当前筛选条件
- **收藏夹迁移**(M6.3 前置):旧 collection 缺 `sortOrder` / `pinned` 时,`migrateCollections()` 按 createdAt 倒序 lazy 写回,后台启动时自动触发

### 变更

- **可靠性收口**(M6.0):采集 / 加载 / 导出回调加 `.catch` 兜底,`loadItems` / `loadCollections` 加 `lastError` 检查 + SW 休眠时重试 1 次;批量下载间隔 300ms → 800ms + 失败重试 1 次 + 错误详情(避免 CDN 限流)
- **样本数据生成**(M6.1):`generate-sample-items.mjs` 加 `--json` 模式输出纯 JSON(避免 DevTools 粘贴大 JSON 卡死),新增 `serve-samples.mjs` 本地静态服务
- **视觉一致性**(M6.3):4 处 button `fontWeight: 500` → `600`(LibCell / LibRow / toolbarButton / sidebarCount)

### 修复

- **TDZ 白屏 bug**(M6.4 顺手):PR #10 引入 `useEffect deps [selectedCount, ...]` 在 useEffect 调用时立即求值,selectedCount 后续才声明,触发 `Cannot access before initialization`。改用 `useRef` 模式(handler 在 render 阶段赋值给 ref,useEffect deps = `[]` 只挂载一次)
- **React DOM 警告**(M6.1 验证时发现):3 处 `borderColor` 单写属性与 `border` 简写冲突(渲染时 React 移除 borderColor,选中态边框错乱),全部改完整 `border` 简写;`SidebarItem` 外层 `<button>` 改 `<div role="button">`(因 M5 加了"改/删"真实 button,button 嵌套 button 违反 HTML 规范)
- **删除撤销排序保证**(M5 + 验证):`restoreItems` 按 id 去重保留原始 `id` / `collectedAt`,撤销后排序与删除前完全一致
- **侧栏收藏夹顺序稳定性**(M6.3):新 collection `sortOrder = max + 1` 显式赋值,UI 排序可预测,不再依赖 `prepend` 顺序

### 安全

- **`enqueueWrite()` 串行化新增写入**:导出历史 / 收藏夹排序 / 移动条目 / 改色 / 置顶 全部走串行队列
- **M6.0 Spike 结论**:单个下载成功,批量部分失败 → **CDN 限流**(非防盗链 / 非 OOM),不引入 `offscreen` / `declarativeNetRequest` 权限
- **路径穿越防御**:`isUnsafePath` 持续生效
- **导出历史 LRU 50**:不存 blob / data URL,只存 url / filename / error 最小重试信息

## [2.0.0] - 2026-06-17

M1-M5 完整周期后的第一个稳定主版本。新增全屏素材库、收藏夹、分文件夹导出、light 主题,popup 全面重设计。

### 新增

- **全屏素材库**(M2):独立 tab 页 `tabs/library.html`,左栏导航(全部/最近/未分类/收藏夹/平台)+ 数据看板(今日采集 / 素材总量 / 关注作者 / 本周已导出)+ 密集网格 + 批量操作
- **收藏夹**(M3):多对多关联,`background/collections.ts` 独立模块,支持创建 / 重命名 / 删除 / 分配 / 移出,删除收藏夹级联清理 `MediaItem.collectionIds`
- **分文件夹导出**(M4):按收藏夹 / 作者 / 未分类分子目录落盘(`media-collector/<folder>/<name>`),路径穿越防御(`isUnsafePath` 不误伤含 `..` 的合法文件名)
- **导出反馈 Toast**(M4):成功 / 部分失败 / 失败三种状态 + 「打开下载目录」action(语义准确,`chrome.downloads.showDefaultFolder()` 只承诺打开默认下载目录)
- **light 主题 + 跟随系统**(P3-21):`lib/design-tokens.ts` 提供 `darkTheme` / `lightTheme` 双主题,`ThemeProvider` 支持 `auto` / `dark` / `light` 三态循环,用户偏好持久化到 `chrome.storage.local[theme_mode]`
- **键盘与 a11y 收口**(M5):库页 `Esc` 优先级 对话框 > 预览 > 搜索;`CollectionDialog` `Enter` 提交 + `Esc` 关闭;侧栏收藏夹「改/删」真实 button;`LibraryRow` 键盘激活
- **空状态分支**(M5):区分"还没有素材"(大空状态 + 引导)与"筛选无结果"(小空状态 + 一键清空)

### 变更

- **popup 紧凑密度重设计**(M1):Apple Music 沉浸风 → 数据看板 + 4 列时间分节网格 + 工具栏(打开素材库 / 主题切换 / 搜索)
- **主题 token 迁移**(P3-19):`popup-theme.ts` → `lib/design-tokens.ts` + `lib/use-theme.tsx`,`ThemeTokens` 接口 + 双主题,组件经 `useTheme()` hook 消费
- **主题强调色**:`#0066cc` → `#0a84ff`(更活泼的系统蓝,Apple Action Blue 同色)
- **视觉一致性**(M5):4 处 button `fontWeight: 500` → `600`,库页硬编码 `rgba` 改 `theme.*` 修 light 主题失效
- **响应式**(M5):toolbar / subbar `flexWrap`,searchWrap `minWidth: 220`,dashboard `auto-fit` minmax(220px, 1fr) — 1024+ 4 列,700-1024 2-3 列

### 修复

- **XHS 列表页 hover 采集整体移除**:瀑布流卡片缺视频元数据,主动预取 API 触发反爬(`_sabo_*` 返回 500),统一为详情页一键采集
- **`getNoteMediaFromState` stale id 防护**:MAIN world 拦截器 LRU 上限 200,保留最新 150
- **混合平台批量导出 Referer 修复**:每个文件按自身 platform 计算,不再统一取第一项
- **删除撤销排序保证**:`restoreItems` 按 id 去重保留原始 `id` / `collectedAt`,撤销后排序与删除前完全一致
- **删除按钮二次确认反人类设计**:FloatBar 删除不再用"3 秒倒计时细线"模式,改为立即删除 + Toast 撤销(Apple Mail / Notion / Gmail 通用模式)

### 安全

- **`enqueueWrite()` 串行化所有 storage 写入**:避免 service worker 并发写丢更新
- **service worker blob → data URL**:`FileReader.readAsDataURL`,不依赖 `URL.createObjectURL`(SW 无 DOM)
- **路径穿越防御**(`isUnsafePath`):拒绝绝对路径 / `.` / `..` 段,按 `/ \` 拆段精确判定
- **MV3 API 边界严格化**:`chrome.downloads` / `chrome.scripting` / `chrome.tabs` 只在 background service worker,`URL.createObjectURL` / `document` / `window` 只在有 DOM 的环境

## [1.0.0] - 2026-04-15

首版。基于 Plasmo + Manifest V3 + React 18 + TypeScript strict。覆盖小红书笔记浮层/详情页采集 + 抖音视频 hover 采集 + popup Apple Music 沉浸风初版。
