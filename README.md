# 素材采集助手

**当前版本: v2.1.0**([CHANGELOG](./CHANGELOG.md)) | M1-M6 完整周期,大素材量效率增强

一键采集小红书、抖音的图片和视频素材。

## 功能特性

### 小红书采集
- **浮层内采集**：点击笔记弹出浮层后，浮层内出现「采集素材」按钮，点击一键采集该笔记的全部图片或视频
- **图集/视频自适应**：自动从 `__INITIAL_STATE__` 识别笔记类型，图集采全部图片，视频采视频流
- **时间分节展示**：素材按「今天 / 昨天 / 本周 / 更早」分节，每节内按采集时间倒序
- **作者轮播**：顶部横向作者头像列表，点击按作者筛选；"未分类"沉底
- **Hero 大图**：最新采集的带封面素材置顶大图展示，右上角带「下载」「原帖」两个快速操作
- **大图预览**：点击素材查看大图，同一笔记的图片可左右切换

### 抖音采集
- 悬停视频自动显示采集按钮，支持视频下载

### 通用功能
- **平台筛选**:全部 / 小红书 / 抖音,选中态用平台品牌色(小红书红 `#FF2442` / 抖音 cyan `#25F4EE`)
- **类型筛选**:图标 segmented control(📷 图片 / 🎬 视频),单击切换
- **批量选择 + 批量下载**(自动按笔记标题命名)
- **分文件夹导出**:全屏素材库页按收藏夹/作者/未分类分子目录落盘(`media-collector/<folder>/`),导出后 Toast 可一键打开文件夹
- **删除 + 撤销**:点击垃圾桶立即删除,底部 Toast「已删除 N 项」5 秒内可点撤销
- **键盘快捷键**:`Cmd/Ctrl+K` 聚焦搜索,`Cmd/Ctrl+A` 全选,`E` 导出,`C` 加入收藏夹,`Delete`/`Backspace` 删除(走撤销),`Esc` 优先级关闭
- **右键菜单采集**(图片/视频上右键 → "📥 采集此素材")
- **快捷键采集**(`Ctrl/Cmd+Shift+S`)
- **反防盗链**:在后台 service worker 中 `fetch()` 携带平台 `Referer`,绕过 CDN 防盗链限制
- **大列表性能**(`M6`):500-1000 条素材渐进渲染(160 + 120 追加),React.memo + 预计算字段(`collectedAtMs` / `timeBucket` / `searchHaystack`)
- **导出历史**(`M6`):toolbar 入口,最近 10 条记录(成功/部分失败/失败),失败项一键重试,LRU 50 条
- **收藏夹增强**(`M6`):侧栏按 pinned → sortOrder → createdAt 排序,编辑 dialog 改色 / 置顶 / 重命名,批量"移动到..."(从源移除并加入目标)

## 使用方法

1. 在 Chrome `chrome://extensions` 加载 `build/chrome-mv3-dev` 目录
2. 打开小红书或抖音网站
3. 小红书：点开笔记（首页浮层或独立详情页均可），点击「采集素材」按钮一键采集全部图片/视频；抖音：鼠标悬停视频，点击采集按钮
4. 点击扩展图标查看采集列表
5. 支持平台筛选、批量选择、批量下载

### 采集说明

| 场景 | 是否能采集图片/视频 |
|------|--------------|
| **小红书笔记**（点开笔记：首页浮层或独立详情页） | ✅ 一键采集全部图片或视频 |
| **小红书信息流瀑布流**（不点开笔记，直接 hover） | ❌ 不支持，请点开笔记 |
| **抖音视频**（鼠标悬停） | ✅ |

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
```

开发时加载 `build/chrome-mv3-dev` 目录到 Chrome。

## 技术栈

- [Plasmo](https://docs.plasmo.com/) — Chrome 扩展框架
- React 18 + TypeScript（strict mode）
- Manifest V3

## 项目结构

```
media-collector-plasmo/
├── popup.tsx                  ← 弹窗主组件(M1 紧凑密度:数据看板 + 4 列时间分节网格 + Toast)
├── popup.html                 ← 弹窗容器(460×660 / 圆角 / 隐藏滚动条)
├── lib/
│   ├── design-tokens.ts       ← 主题 token 唯一权威源(ThemeTokens 接口 + darkTheme/lightTheme + 时间分桶)
│   ├── use-theme.tsx          ← ThemeProvider + useTheme hook(auto/dark/light 三态,持久化)
│   ├── base.ts                ← HoverUIManager(抖音用)/ 媒体检测 / Toast / 下载工具(部分遗留)
│   ├── xhs-state-inject.ts    ← stateInjector():被 background executeScript 注入 MAIN world
│   ├── xhs-detail-collector.ts ← 小红书浮层 DOM 检测 + 「采集素材」按钮跟随
│   └── xhs-image-extractor.ts ← 小红书笔记媒体提取(__mc_notes__ / __mc_state__ 两通路)
├── types.ts                   ← MediaItem / MessageType / 常量(含 RESTORE_ITEMS / 收藏夹消息)
├── package.json               ← manifest + 快捷键 + 依赖
│
├── contents/                  ← 内容脚本(按平台拆分)
│   ├── xiaohongshu.ts         ← 小红书:ISOLATED world,请求注入 MAIN world + 启动浮层采集器
│   └── douyin.ts              ← 抖音:hover 采集
│
├── background/                ← 后台服务(service worker)
│   ├── index.ts               ← 消息路由 + executeScript 注入 MAIN world + 右键菜单 + 快捷键
│   ├── storage.ts             ← chrome.storage.local CRUD(带写队列)+ restoreItems 删除撤销 + markItemsExported
│   ├── collections.ts         ← 收藏夹 CRUD(级联清理 MediaItem.collectionIds)
│   └── download.ts            ← SW fetch + Referer + data URL 下载(防路径穿越,分文件夹)
│
├── components/                ← popup / library 用 React 组件
│   ├── StatCard.tsx           ← 数据看板卡片(今日 / 总量 / 关注作者)
│   ├── MediaCard.tsx          ← 单素材封面卡(点击预览,圆圈选中,hover/press 反馈)
│   ├── FloatBar.tsx           ← 浮动操作栏(全选 / 导出 / 删除;0 选时 dashed 引导)
│   ├── PreviewModal.tsx       ← 大图预览(同笔记图片左右切换 + 键盘 ← →)
│   ├── EmptyState.tsx         ← 空状态(三步图示 + 快捷键提示)
│   └── Toast.tsx              ← 底部 snackbar(删除撤销 / 错误提示共用)
│
├── tabs/                      ← 全屏 tab 页
│   └── library.tsx            ← M2 素材库:左栏导航 + 数据看板 + 密集网格 + 批量操作 + 收藏夹
│
└── AGENTS.md / CLAUDE.md / DESIGN.md / LESSONS.md
```

## 当前开发状态

> v2.1.0 完整 changelog 见 [CHANGELOG.md](./CHANGELOG.md)。下方为开发历程索引,作为变更回顾用。

| 阶段 | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 架构重构(拆分 content / background / components) | ✅ 完成 |
| Phase 2 | 抖音无水印下载 + 批量下载用户视频 | ⏸️ 暂缓(列表页反爬限制) |
| 收敛 | XHS 列表页 hover 采集整体移除,统一为详情页一键采集 | ✅ 完成 |
| Phase 3 | 小红书多图提取 + 笔记分组显示 | ✅ 完成 |
| Phase 4 | 弹窗增强(作者分组、平台筛选、批量操作) | ✅ 完成 |
| Phase 5 | popup UI 重设计(Apple Music 风 + Toast 撤销 + a11y + 主题 token 统一) | ✅ 完成 |
| P3-19 | `popup-theme.ts` → `lib/design-tokens.ts`(`ThemeTokens` 接口 + 双主题) | ✅ 完成 |
| P3-21 | light 主题 + 跟随系统 + 顶栏主题切换 UI | ✅ 完成 |
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
4. **手动验证**(可选但推荐):Chrome `Load unpacked` 选 `build/chrome-mv3-prod/`,跑一遍核心流程(采集 / popup / 库页 / 主题切换 / 收藏夹 / 导出)
5. **触发 Action**:GitHub 仓库 → Actions → "Submit to Web Store" → Run workflow
   - 依赖 `SUBMIT_KEYS` secret(Chrome Web Store API key)
   - Action 跑 `pnpm build` → `pnpm package` → `PlasmoHQ/bpp` 上传

**注意**:Action 内会重新 build/package,本地产物仅用于本地验证。**绝不要**绕过此 Action 用其他方式发布。

详细设计见 [DESIGN.md](./DESIGN.md)。

## 许可证

MIT