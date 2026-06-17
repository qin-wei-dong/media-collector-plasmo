# 素材采集助手 v2.0 — 扩展设计文档

> 状态：进行中（Phase 1/3/4 已完成） | 日期：2026-06-10 | 更新：2026-06-11

---

## 一、目标

在 v1.0 基础上新增三项核心能力：

| 序号 | 功能 | 优先级 | 复杂度 |
|------|------|--------|--------|
| P0 | 抖音视频无水印下载 | 最高 | ⭐⭐⭐ |
| P1 | 小红书笔记多图提取 | 高 | ⭐⭐ |
| P2 | 扩展更多平台（B站/快手/微博） | 中 | ⭐⭐⭐ |

---

## 二、现有架构回顾

```
media-collector-plasmo/
├── popup.tsx          ← React 弹窗 UI（列表/下载管理）
├── content.ts         ← 鼠标悬停检测 + 采集触发（支持 小红书/抖音）
├── background.ts      ← 右键菜单 / 快捷键 / 消息路由 / 存储
└── assets/icon.png
```

**通信流：**

```
content.ts  ──COLLECT_MEDIA──▶  background.ts  ──storage──▶  popup.tsx
            ◀──GET_LAST_MEDIA──                ◀──GET_ITEMS──
```

**当前局限：**
- 只能获取鼠标悬停的那一张图/视频的原始 URL
- 没有平台感知：不知道是笔记详情页还是列表页
- 没有去水印逻辑：抖音 URL 直接拿到的可能带水印

---

## 三、技术方案

### 3.1 小红书多图提取

**原理：** 小红书笔记详情页（`xiaohongshu.com/explore/{noteId}`）在 `window.__INITIAL_STATE__` 中存储了笔记的完整数据。

**提取流程：**

```
1. 检测页面是笔记详情页还是列表页
   └─ URL 包含 /explore/ 或 /discovery/item/

2. 从 __INITIAL_STATE__ 提取笔记数据
   └─ window.__INITIAL_STATE__?.note?.noteDetailMap?.[noteId]?.note

3. 解析图片列表
   └─ .imageList[] → { url, width, height, traceId }
   └─ 去掉 ?imageView2/... 后缀 → 原图 URL
   └─ .video?.media?.stream?.h264?.[0]?.masterUrl → 视频

4. 提取文本内容（标题 + 正文）
   └─ .title / .desc
```

**UI 交互：**

```
当前（v1.0）：悬停单张图 → 采集按钮 → 采集这一张
v2.0 新增：  悬停笔记卡片 → 出现「采集本笔记」按钮
                ↓
              弹窗中选择「当前图片」或「全部图片(N张)」
                ↓
              选择「全部」时 → background 解析 __INITIAL_STATE__
                ↓
              批量采集所有图片到列表
```

**关键代码示意：**

```typescript
function extractXHSNoteImages(): ImageData[] {
  const state = (window as any).__INITIAL_STATE__
  if (!state?.note) return []

  // 从 URL 提取 noteId
  const noteId = location.pathname.split("/").pop() || ""
  const note = state.note.noteDetailMap?.[noteId]?.note
    || state.note.noteDetailMap?.[Object.keys(state.note.noteDetailMap)[0]]?.note

  if (!note?.imageList) return []

  return note.imageList.map((img: any) => ({
    url: img.url.replace(/\?imageView2.*$/, ""),  // 去压缩参数得原图
    width: img.width,
    height: img.height,
  }))
}
```

**⚠️ 风险点：**
- `__INITIAL_STATE__` key 路径可能在迭代中变化
- SPA 路由切换时状态可能丢失，需要监听 URL 变化
- 部分笔记有访问权限控制

---


## 四、架构重构

### 4.1 目录结构(Phase 5 后)

```
media-collector-plasmo/
├── contents/                    ← 拆分为多平台
│   ├── xiaohongshu.ts           ← 小红书:浮层采集器(请求注入 MAIN world + 启动 startDetailCollector)
│   └── douyin.ts                ← 抖音:hover 采集
├── background/
│   ├── index.ts                 ← 消息路由 + install + 右键菜单 + 快捷键 + RESTORE_ITEMS
│   ├── storage.ts               ← 存储 CRUD(带写锁) + restoreItems(删除撤销)
│   └── download.ts              ← 单条/批量下载(SW fetch + Referer + data URL)
├── lib/
│   ├── base.ts                  ← 抖音用:悬停检测 / 按钮渲染
│   ├── xhs-state-inject.ts      ← stateInjector():被 background executeScript 注入 MAIN world
│   ├── xhs-detail-collector.ts  ← 小红书浮层 DOM 检测 + 「采集素材」按钮跟随
│   └── xhs-image-extractor.ts   ← 小红书笔记媒体提取(__mc_notes__ / __mc_state__ 两通路)
├── components/                  ← popup 用 React 组件(Apple Music 风)
│   ├── Hero.tsx                 ← 最新素材大图 + 快速操作(下载/原帖)
│   ├── AuthorCarousel.tsx       ← 作者头像横向轮播
│   ├── MediaCard.tsx            ← 单素材封面卡(1:1,hover/press 反馈)
│   ├── FloatBar.tsx             ← 浮动操作栏(全选 / 批量下载 / 删除)
│   ├── PreviewModal.tsx         ← 大图预览(同笔记左右切换 + 键盘)
│   ├── EmptyState.tsx           ← 空状态(三步图示 + 快捷键提示)
│   └── Toast.tsx                ← 底部 snackbar(删除撤销 / 错误提示)
├── popup.tsx                    ← 弹窗主组件
├── popup-theme.ts               ← 主题 token 唯一权威源(已迁出,见下文注脚)
├── popup.html                   ← 弹窗容器(460px / 圆角 / 隐藏滚动条)
├── types.ts                     ← 共享类型定义
└── assets/
```

### 4.2 数据模型扩展

```typescript
interface MediaItem {
  id: string
  url: string              // 媒体 URL
  type: "image" | "video"
  platform: "xiaohongshu" | "douyin"
  title: string
  sourceUrl: string         // 来源页面 URL
  collectedAt: string

  // v2 新增字段
  originalUrl?: string      // 原始无水印 URL
  coverUrl?: string         // 视频封面
  author?: string           // 作者名
  duration?: number         // 视频时长（秒）
  width?: number            // 图片宽度
  height?: number           // 图片高度
  noteId?: string           // 小红书笔记 ID（关联同一笔记的多图）
  groupIndex?: number       // 多图中的序号

  // UI 状态
  _selected?: boolean
}
```

### 4.3 消息类型扩展

```typescript
type MessageType =
  | "COLLECT_MEDIA"           // 采集单个(现有)
  | "COLLECT_NOTE_IMAGES"     // 采集整个笔记的全部图片(Phase 3)
  | "GET_ITEMS"               // 获取列表(现有)
  | "CLEAR_ITEMS"             // 清空(现有)
  | "BATCH_DOWNLOAD"          // 批量下载(现有)
  | "GET_LAST_MEDIA"          // 获取最后悬停(现有)
  | "INJECT_MAIN_WORLD"       // 请求 background 注入 MAIN world 拦截器(Phase 5)
  | "REMOVE_ITEMS"            // 删除选中(Phase 4)
  | "RESTORE_ITEMS"           // 删除撤销:把刚删除的素材写回(Phase 5)

// 注意:EXTRACT_VIDEO_INFO 与 DOWNLOAD_ITEM 已在代码中删除或未接线
```

### 4.4 Plasmo 配置

```json
// package.json manifest 段
{
  "manifest": {
    "host_permissions": [
      "https://www.xiaohongshu.com/*",
      "https://www.douyin.com/*",
    ]
  }
}
```

每个平台的内容脚本独立注册，避免一个脚本在所有网站注入。

---

## 五、实施路线图

### Phase 1：架构重构（1天） ✅ 已完成

- [x] 拆分 `content.ts` 为 `contents/xiaohongshu.ts` + `contents/xiaohongshu-state.ts` + `contents/douyin.ts`
- [x] 拆分 `background.ts` 为 `background/index.ts` + `background/storage.ts` + `background/download.ts`
- [x] 抽象共享 UI 组件（`MediaCard`、`BatchBar`、`PlatformFilter`、`NoteGroup`）
- [x] 验证 v1.0 功能不受影响

### Phase 2：抖音无水印下载（1.5天） ⏳ 待实现

- [ ] 分析抖音视频 URL 结构
- [ ] 实现无水印 URL 解析
- [ ] 批量下载用户视频功能

### Phase 3：小红书多图（1天） ✅ 已完成

- [x] 实现笔记详情页检测
- [x] 解析 `window.__INITIAL_STATE__` 获取全部图片
- [x] DOM 提取 + state 提取双路径兜底
- [x] 新增「采集本笔记全部图片(N张)」选择弹窗
- [x] 弹窗中按笔记分组显示（可折叠）
- [x] 批量下载时自动命名（标题_序号.jpg）

### Phase 4：弹窗增强（0.5天） ✅ 已完成

- [x] 平台筛选组件（全部/小红书/抖音）
- [x] 笔记分组折叠视图
- [x] 批量操作栏（全选/已选计数/批量下载）

### Phase 5：popup UI 重设计 + 主题 token 统一（2026-06）✅ 已完成

Phase 1-4 的 popup 仍然是基于「AuthorGroup → NoteGroup → MediaCard」三级折叠的列表式界面，信息密度高但缺乏 Apple Music 类的沉浸感；筛选/删除/键盘可达性等也有可优化空间。本期一次性合并以下工作：

#### 5.1 视觉与品牌

- 整体重设计为 **Apple Music 沉浸式深色**(Hero + 作者轮播 + 时间分节网格 + 浮动玻璃操作栏 + 大图预览)
  - 📅 **2026-06 后续变更**:M1 (popup-density) 又把弹窗改为紧凑密度(数据看板 + 4 列网格),Hero + AuthorCarousel 于 2026-06 cleanup 删除;M1 描述见 `docs/superpowers/plans/2026-06-16-m1-popup-density-implementation.md`
- 主题 token 抽取到 `popup-theme.ts`,严格对齐 `mockups/tokens.css`:
  - 📅 **P3-19 后续迁移**:主题 token 已迁至 `lib/design-tokens.ts`(`ThemeTokens` 接口 + `darkTheme`/`lightTheme` 双主题),由 `lib/use-theme.tsx` 的 `ThemeProvider` 持有;`popup-theme.ts` 已删除。三份文档(CLAUDE.md / AGENTS.md / README.md)均已同步。
  - 强调色从 `#ffffff` 改为 **Apple Action Blue `#0066cc`**(`accent` / `accentFocus` / `accentDark` / `accentLight`)
  - 圆角从 6 档 (8/10/14/16/22/pill) 收齐为 5 档 (5/8/11/18/pill) 与 tokens.css 对齐
  - 新增 `sp` (8pt 间距 7 档) / `btn` (按钮尺寸 4 档) / `fs` (字号 6 档) / `focus` (focus ring) / `xhs` (品牌红) / `douyin` (品牌 cyan) tokens
- 平台 chip 激活态用平台品牌色:小红书 `#FF2442` / 抖音 `#25F4EE`
- 顶栏加品牌 logo(双层叠片渐变 SVG)+ 字号对齐 Apple Type Scale

#### 5.2 交互修复

- **删除确认重构**:FloatBar 不再用「3 秒倒计时二次确认」(细红线在按钮底部,普通用户基本看不见),改为**立即删除 + 底部 Toast「已删除 N 项」+ 5 秒可撤销**。新增 `components/Toast.tsx` 通用 snackbar、`types.ts` 的 `RESTORE_ITEMS` 消息、`background/storage.ts` 的 `restoreItems()` 函数(按 id 去重,保留原始 `id` / `collectedAt`)。
- **类型筛选改造**:平台筛选有「全部」+ 类型筛选也有「全部」造成认知冲突,改为 **2 图标 segmented control(📷 图片 / 🎬 视频)**,单击切换,重复激活取消选中回到「全部」。
- **Hero 加快速操作**:Hero 右上角加「下载」「原帖」两个玻璃质感圆按钮,「下载」在图集上下载整组、在单图/视频上下载当前项;「原帖」打开 `sourceUrl`。
- **搜索激活时折叠筛选区**:`searchOpen` 为 true 时 `filterRow` / `filterChip` 隐藏,聚焦搜索结果。

#### 5.3 可访问性

- 所有 icon-only 按钮加 `aria-label`(部分还加 `aria-pressed` 表达 toggle 态)
- Hero / MediaCard 卡片区从 `<div onClick>` 改为 `role="button"` + `tabIndex={0}` + Enter/Space 键盘激活
- 全局 `:focus-visible` 蓝色 ring 由 `injectPopupStyles()` 注入,Tab 键走过的元素都有可见焦点
- MediaCard 加 `.mc-card-art` CSS 类:hover 上浮 + 阴影加深 / active 缩小,提供清晰的交互反馈

#### 5.4 体验细节

- AuthorCarousel 头像 coverUrl 加载时用渐变占位、加载完成淡入;失败回退稳定渐变色
- FloatBar 0 选状态:圆圈改 dashed 描边 +「+」字符,文案改为「共 N 项,点击卡片选择」引导用户
- 键盘快捷键:`Cmd/Ctrl+K` 切换搜索、`/` 打开搜索、`Esc` 关闭搜索(穿透到 PreviewModal)
- Hero 高度自适应:从固定 16:9 改为 `aspectRatio: "16/9"` + `maxHeight: 180`,避免在大宽度下过高

#### 5.5 教训沉淀

详见 `LESSONS.md` 新增的「坑 11:popup 设计 token 必须单源」「坑 12:删除确认用时间倒计时是反人类设计」。

#### 5.6 后续可选(P3 战略性)

- `tokens.css` 完整迁移到 TypeScript module,实现 type-safe design system
- axe-core 全面可访问性审计(WCAG 2.1 AA)
- 主题支持(light theme + 跟随系统)

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 平台改版导致解析失效 | 功能完全不可用 | 多 fallback 路径；监控 + 快速更新机制 |
| 无水印 URL 有时效性 | 下载后无法播放 | 采集后提示用户立即下载 |
| 反爬/风控触发验证码 | 无法采集 | 不自动频繁请求；尊重 robots.txt |
| 代码复杂度提升 | 维护成本高 | 良好的模块拆分 + TypeScript 类型约束 |

---

## 七、关键决策点

1. **无水印解析放在 content 还是 background？**
   → 建议放在 content（直接访问页面 DOM 和 window 对象），background 只做存储和下载

2. **content script 如何拆分？**
   → 用 Plasmo 的多 content script 能力，每个平台一个文件，共用 base 逻辑
   ```typescript
   // contents/douyin.ts
   import { createCollectUI, baseStyles } from "./base"
   ```

3. **是否需要后端服务？**
   → 现阶段不需要。所有解析在浏览器端完成。后续如果有签名破解需求，再考虑加轻量后端

---

## 八、参考资料

- 抖音视频 API 接口文档：[iesdouyin.com](https://www.iesdouyin.com)
- 小红书网页版数据解析：`window.__INITIAL_STATE__`
- Plasmo 多内容脚本：[docs.plasmo.com](https://docs.plasmo.com/framework/customization/multiple-content-scripts)
- Chrome Extension Manifest V3：[developer.chrome.com](https://developer.chrome.com/docs/extensions/mv3/)

---

## 九、更新路线图

| Phase | 内容 | 估时 | 状态 |
|-------|------|------|------|
| 1 | 架构重构(拆分 content / background / components) | 1天 | ✅ 已完成 |
| 2 | 抖音无水印下载 + 批量下载 | 1.5天 | ⏸️ 暂缓(详见下文) |
| 3 | 小红书多图提取 + 笔记分组显示 | 1天 | ✅ 已完成 |
| 4 | 弹窗增强(平台筛选、进度条、分组视图) | 0.5天 | ✅ 已完成 |
| 5 | popup UI 重设计 + 主题 token 统一 + a11y | 持续 | ✅ 已完成 |

### Phase 2 暂缓说明

**原计划**：通过 hover 检测抖音视频笔记，解析无水印视频 URL，批量下载。

**现状**：Phase 2 暂缓，详见 [AGENTS.md](./AGENTS.md) "⚠️ Architectural constraint: video collection" 一节。简述：小红书和抖音的视频元数据（`video.media.stream`）只在用户进入笔记详情页后才注入 `window.__INITIAL_STATE__`，列表页 hover 拿不到。所有尝试从列表页主动预取视频 URL 的方案（CSP 拦截、`chrome.scripting.executeScript`、API 调用）都被 XHS 反爬系统拦截（HTTP 500，签名校验失败）。

**当前方案**：列表页 hover 视频笔记降级为采集封面图；用户必须先进入详情页让 state 加载视频元数据，之后回到列表页 hover 同一笔记走缓存命中路径，按视频采集。

**后续方向**（待定）：
- 监控 XHS 公开 API 的反爬策略变化（不太可能）
- 调研第三方无水印解析服务（合规风险高）
- 接受限制，重点优化图片采集链路和批量下载体验

### Phase 1-5 实施备注

- Phase 1 完成后 `DESIGN.md` 描述的 `content.ts` / `background.ts` 单文件结构已不存在，改为按平台拆分的 `contents/` + `background/` 模块
- Phase 4 的"分组视图"最初实现为 **作者 → 笔记 → 图片卡片** 三层折叠(`AuthorGroup` 嵌入 `NoteGroup` 嵌入 `MediaCard`),Phase 5 重设计为 Apple Music 沉浸式深色界面,三级折叠已被 Hero + 作者轮播 + 时间分节网格取代
  - 📅 **2026-06 cleanup 后续**:M1 又改为紧凑密度(数据看板 + 4 列网格),Hero / AuthorCarousel 组件于 2026-06 cleanup 删除,popup 仅保留 `StatCard` / `MediaCard` / `FloatBar` / `PreviewModal` / `EmptyState` / `Toast` 六个组件
- Phase 5 同时删除了 `BatchBar` / `NoteGroup` / `PlatformFilter` 三个组件,被 `FloatBar` / `AuthorCarousel` / 类型 segmented control 取代;新增 `Toast` 组件用于删除撤销和错误提示
  - 📅 **2026-06 cleanup 后续**:AuthorCarousel 也已删除,被 M1 的紧凑密度(无作者轮播)取代
- 主题 token 唯一权威源在 `popup-theme.ts`,与 `mockups/tokens.css` 对齐(r/sp/btn/fs/focus/accent/xhs/douyin),组件禁止内联 magic value
  - 📅 **P3-19 后续迁移**:已迁至 `lib/design-tokens.ts` + `lib/use-theme.tsx`,见 §5.1 段落内 P3-19 注脚
