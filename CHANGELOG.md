# Changelog

All notable changes to this project will be documented in this file.

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
