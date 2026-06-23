# 素材采集助手

**当前版本: v2.1.1**([CHANGELOG](./CHANGELOG.md)) | 小红书素材采集与本地管理

点开小红书笔记后，一键采集图片或视频素材，并在本地素材库中统一管理、收藏和批量导出。

## 功能特性

### 小红书采集
- **浮层内采集**：点击笔记弹出浮层后，浮层内出现「采集素材」按钮，点击一键采集该笔记的全部图片或视频
- **图集/视频自适应**：自动从 `__INITIAL_STATE__` 识别笔记类型，图集采全部图片，视频采视频流

### 通用功能
- **深色主题优先**:当前发布版以深色主题为主,light/auto 作为后续基础设施
- **全屏素材库**:点击扩展图标直接打开工作台,支持左侧导航、数据看板、密集网格和列表视图
- **时间分节展示**:素材按「今天 / 昨天 / 本周 / 更早」分节,每节内按采集时间倒序
- **大图预览**:点击素材查看大图,同一笔记的图片可左右切换
- **平台筛选**:按来源平台筛选素材
- **类型筛选**:图标 segmented control(📷 图片 / 🎬 视频),单击切换
- **批量选择 + 批量下载**(自动按笔记标题命名)
- **分文件夹导出**:全屏素材库页按收藏夹/作者/未分类分子目录落盘(`media-collector/<folder>/`),导出后 Toast 可打开下载目录并保留系统通知
- **删除 + 撤销**:点击垃圾桶立即删除,底部 Toast「已删除 N 项」5 秒内可点撤销
- **键盘快捷键**:`Cmd/Ctrl+K` 聚焦搜索,`Cmd/Ctrl+A` 全选,`E` 导出,`C` 加入收藏夹,`Delete`/`Backspace` 删除(走撤销),`Esc` 优先级关闭
- **小红书页面右键采集**(图片/视频上右键 → "📥 采集此素材")
- **快捷键采集**(`Ctrl/Cmd+Shift+S`)
- **反防盗链**:在后台 service worker 中 `fetch()` 携带平台 `Referer`,绕过 CDN 防盗链限制
- **大列表性能**(`M6`):500-1000 条素材渐进渲染(160 + 120 追加),React.memo + 预计算字段(`collectedAtMs` / `timeBucket` / `searchHaystack`)
- **导出历史**(`M6`):toolbar 入口,最近 10 条记录(成功/部分失败/失败),失败项一键重试,LRU 50 条
- **收藏夹增强**(`M6`):侧栏按 pinned → sortOrder → createdAt 排序,编辑 dialog 改色 / 置顶 / 重命名,批量"移动到..."(从源移除并加入目标)

## 使用方法

1. 在 Chrome `chrome://extensions` 加载 `build/chrome-mv3-dev` 目录
2. 打开小红书网站
3. 点开笔记（首页浮层或独立详情页均可），点击「采集素材」按钮一键采集全部图片/视频
4. 点击扩展图标打开全屏素材库
5. 在素材库中搜索、收藏、预览、批量选择和导出

### 采集说明

| 场景 | 是否能采集图片/视频 |
|------|--------------|
| **小红书笔记**（点开笔记：首页浮层或独立详情页） | ✅ 一键采集全部图片或视频 |
| **小红书信息流瀑布流**（不点开笔记，直接 hover） | ❌ 不支持，请点开笔记 |
| **更多平台** | ⏳ 暂不作为当前发布承诺，后续根据用户反馈评估 |

**为什么不支持信息流 hover 采集？** 小红书笔记的完整元数据（图集全部图片 + 视频流）只有在**点开笔记**后才可获取：独立详情页通过 `window.__INITIAL_STATE__` 注入（SSR），首页浮层通过 MAIN world 拦截 XHR/fetch 响应获取（CSR），两者都缓存到 localStorage 供一键采集。而信息流瀑布流卡片只有封面图、视频元数据缺失，主动预取笔记 API 会触发 XHS 反爬（返回 500）。因此统一收敛为「点开笔记 → 一键采集」——更稳定、视频完整、合规性更好。

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器（watch build/chrome-mv3-dev）
pnpm dev

# 构建生产版本
pnpm build

# 打包扩展（用于 Chrome Web Store 发布）
pnpm package

# 运行单元测试（vitest）
pnpm test
```

开发时加载 `build/chrome-mv3-dev` 目录到 Chrome。

## 技术栈

- [Plasmo](https://docs.plasmo.com/) — Chrome 扩展框架
- React 18 + TypeScript（strict mode）
- Manifest V3

## 项目结构

```
media-collector-plasmo/
├── lib/
│   ├── design-tokens.ts       ← 主题 token 唯一权威源(ThemeTokens 接口 + darkTheme/lightTheme + 时间分桶)
│   ├── use-theme.tsx          ← ThemeProvider + useTheme hook(深色主题优先,light/auto 作为基础设施)
│   ├── base.ts                ← HoverUIManager(遗留)/ 媒体检测 / Toast / 下载工具(部分遗留)
│   ├── xhs-state-inject.ts    ← stateInjector():被 background executeScript 注入 MAIN world
│   ├── xhs-detail-collector.ts ← 小红书浮层 DOM 检测 + 「采集素材」按钮跟随
│   └── xhs-image-extractor.ts ← 小红书笔记媒体提取(__mc_notes__ / __mc_state__ 两通路)
├── types.ts                   ← MediaItem / MessageType / 常量(含 RESTORE_ITEMS / 收藏夹消息)
├── package.json               ← manifest + 快捷键 + 依赖
│
├── contents/                  ← 内容脚本(按平台拆分)
│   └── xiaohongshu.ts         ← 小红书:ISOLATED world,请求注入 MAIN world + 启动浮层采集器
│
├── background/                ← 后台服务(service worker)
│   ├── index.ts               ← 消息路由 + executeScript 注入 MAIN world + 右键菜单 + 快捷键
│   ├── storage.ts             ← chrome.storage.local CRUD(带写队列)+ restoreItems 删除撤销 + markItemsExported
│   ├── collections.ts         ← 收藏夹 CRUD(级联清理 MediaItem.collectionIds)
│   └── download.ts            ← SW fetch + Referer + data URL 下载(防路径穿越,分文件夹)
│
├── components/                ← 共享 React 组件
│   └── PreviewModal.tsx       ← 大图预览(同笔记图片左右切换 + 键盘 ← →)
│   (StatCard / MediaCard / FloatBar / EmptyState / LibraryToast 等已内联进 library.tsx,P1 候选拆分)
│
├── tabs/
│   └── library.tsx            ← 全屏素材库入口(action 点击直接打开 tabs/library.html)
│
└── AGENTS.md / CLAUDE.md / DESIGN.md / LESSONS.md
```

## 当前开发状态

> 完整 changelog 见 [CHANGELOG.md](./CHANGELOG.md)。下方为开发历程索引,作为变更回顾用。

| 阶段 | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 架构重构(拆分 content / background / components) | ✅ 完成 |
| Phase 2 | 其他平台视频下载能力 | ⏸️ 暂缓(列表页反爬限制) |
| 收敛 | XHS 列表页 hover 采集整体移除,统一为详情页一键采集 | ✅ 完成 |
| Phase 3 | 小红书多图提取 + 笔记分组显示 | ✅ 完成 |
| Phase 4 | 弹窗增强(作者分组、平台筛选、批量操作) | ✅ 完成 |
| Phase 5 | popup UI 重设计(Apple Music 风 + Toast 撤销 + a11y + 主题 token 统一) | ✅ 完成 |
| P3-19 | `popup-theme.ts` → `lib/design-tokens.ts`(`ThemeTokens` 接口 + 双主题) | ✅ 完成 |
| P3-21 | 深色主题优先的主题基础设施 | ✅ 完成 |
| M1 | popup 紧凑密度重设计(数据看板 + 4 列网格) | ✅ 完成 |
| M2 | 全屏素材库 `tabs/library.tsx` | ✅ 完成 |
| M3 | 收藏夹(Collections)+ `background/collections.ts` 独立模块 | ✅ 完成 |
| M4 | 分文件夹导出 + 导出反馈 Toast + 「本周已导出」看板 | ✅ 完成 |
| M5 | 稳定性与体验打磨(批量选择安全 / 导出文案 / 空状态 / a11y / 视觉一致性 / 响应式) | ✅ 完成 |
| M6 | 大素材量效率增强 — 大列表性能 / 收藏夹增强 / 导出历史 / 快捷键 | ✅ 完成 |

## 发布到 Chrome Web Store

发布流程手动触发,GitHub Action `Submit to Web Store`(`.github/workflows/submit.yml`,`workflow_dispatch`):

1. **更新版本号**:`package.json` 的 `version` 字段(同步更新 `displayName` / `description` 如有改动)
2. **写 changelog**:`CHANGELOG.md` 顶部加新版本段,按 Keep a Changelog 格式
3. **构建生产包**:
   ```bash
   pnpm build        # 输出 build/chrome-mv3-prod/
   pnpm package      # 输出 build/chrome-mv3-prod.zip
   ```
4. **手动验证**(可选但推荐):Chrome `Load unpacked` 选 `build/chrome-mv3-prod/`,跑一遍核心流程(采集 / 打开素材库 / 收藏夹 / 导出 / 导出历史)
5. **触发 Action**:GitHub 仓库 → Actions → "Submit to Web Store" → Run workflow
   - 依赖 `BPP_KEYS` secret(Chrome Web Store API key,`SUBMIT_KEYS` 仍兼容)
   - Action 跑 `pnpm build` → `pnpm package` → `PlasmoHQ/bpp` 上传

**注意**:Action 内会重新 build/package,本地产物仅用于本地验证。**绝不要**绕过此 Action 用其他方式发布。

发布前按 [Release Checklist](./docs/release/release-checklist.md) 逐项核对。v2.1.1 发布过程中遇到的 `BPP_KEYS`、OAuth、Chrome Web Store API 403 等问题已整理到 [v2.1.1 发布复盘](./docs/release/2026-06-23-v2.1.1-publish-retrospective.md),后续发版优先使用本地 skill `$fenix-chrome-publish`。

详细设计见 [DESIGN.md](./DESIGN.md)。

## 许可证

MIT
