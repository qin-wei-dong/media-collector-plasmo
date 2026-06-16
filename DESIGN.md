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

### 4.1 目录结构

```
media-collector-plasmo/
├── contents/                    ← 拆分为多平台
│   ├── xiaohongshu.ts           ← 小红书：单图 + 多图提取（ISOLATED world）
│   ├── xiaohongshu-state.ts     ← 小红书：拦截 __INITIAL_STATE__（MAIN world）
│   └── douyin.ts                ← 抖音：视频采集
├── background/
│   ├── index.ts                 ← 消息路由 + 安装初始化
│   ├── storage.ts               ← 存储 CRUD（带写锁）
│   └── download.ts              ← 单条/批量下载
├── lib/
│   └── base.ts                  ← 共享：悬停检测、按钮渲染、Toast
├── components/
│   ├── MediaCard.tsx            ← 素材卡片
│   ├── BatchBar.tsx             ← 批量操作栏
│   ├── PlatformFilter.tsx       ← 平台筛选
│   └── NoteGroup.tsx            ← 笔记分组折叠
├── popup.tsx                    ← 弹窗主组件
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
// 新增消息类型
type MessageType =
  | "COLLECT_MEDIA"           // 采集单个（现有）
  | "COLLECT_NOTE_IMAGES"     // 采集整个笔记的全部图片（新增）
  | "EXTRACT_VIDEO_INFO"      // 提取视频页信息（新增，background 处理）
  | "GET_ITEMS"               // 获取列表（现有）
  | "CLEAR_ITEMS"             // 清空（现有）
  | "DOWNLOAD_ITEM"           // 单条下载（现有）
  | "BATCH_DOWNLOAD"          // 批量下载（现有）
  | "GET_LAST_MEDIA"          // 获取最后悬停（现有）
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
| 1 | 架构重构（拆分 content / background / components） | 1天 | ✅ 已完成 |
| 2 | 抖音无水印下载 + 批量下载 | 1.5天 | ⏸️ 暂缓（详见下文） |
| 3 | 小红书多图提取 + 笔记分组显示 | 1天 | ✅ 已完成 |
| 4 | 弹窗增强（平台筛选、进度条、分组视图） | 0.5天 | ✅ 已完成 |

### Phase 2 暂缓说明

**原计划**：通过 hover 检测抖音视频笔记，解析无水印视频 URL，批量下载。

**现状**：Phase 2 暂缓，详见 [AGENTS.md](./AGENTS.md) "⚠️ Architectural constraint: video collection" 一节。简述：小红书和抖音的视频元数据（`video.media.stream`）只在用户进入笔记详情页后才注入 `window.__INITIAL_STATE__`，列表页 hover 拿不到。所有尝试从列表页主动预取视频 URL 的方案（CSP 拦截、`chrome.scripting.executeScript`、API 调用）都被 XHS 反爬系统拦截（HTTP 500，签名校验失败）。

**当前方案**：列表页 hover 视频笔记降级为采集封面图；用户必须先进入详情页让 state 加载视频元数据，之后回到列表页 hover 同一笔记走缓存命中路径，按视频采集。

**后续方向**（待定）：
- 监控 XHS 公开 API 的反爬策略变化（不太可能）
- 调研第三方无水印解析服务（合规风险高）
- 接受限制，重点优化图片采集链路和批量下载体验

### Phase 1-4 实施备注

- Phase 1 完成后 `DESIGN.md` 描述的 `content.ts` / `background.ts` 单文件结构已不存在，改为按平台拆分的 `contents/` 三文件 + `background/` 三模块
- Phase 4 的"分组视图"实际实现为 **作者 → 笔记 → 图片卡片** 三层折叠（`AuthorGroup` 嵌入 `NoteGroup` 嵌入 `MediaCard`），不是单层笔记分组
- `NoteGroup` 设计之初考虑为 popup 顶层独立组件，但实际更适合做嵌入式二级折叠（`embedded` 模式）
