# AGENTS.md

Chrome extension (Manifest V3) using Plasmo. Collects images/videos from Xiaohongshu and Douyin.

## Commands

```
pnpm dev        # dev server — load build/chrome-mv3-dev in Chrome
pnpm build      # production build
pnpm package    # build + zip
```

No test suite, no linter. Prettier is set up.

## Architecture

```
contents/  (page scripts)  →  background/  (service worker)  →  popup.tsx + components/  (UI)
```

**Plasmo file-based routing** — files in `contents/` are auto-registered as content scripts, `background/index.ts` is the service worker, `popup.tsx` at root is the popup entry. **`lib/base.ts` is deliberately in `lib/` not `contents/` to prevent it being injected on all URLs.**

### XHS MAIN-world interceptor is injected by the background

小红书只有一个 content script：`contents/xiaohongshu.ts`（ISOLATED world, `document_start`）。它启动时发 `INJECT_MAIN_WORLD` 消息，`background/index.ts` 用 `chrome.scripting.executeScript({ world:"MAIN", func: stateInjector })` 把 `lib/xhs-state-inject.ts` 的 `stateInjector()` 注入页面 context——这是 MV3 下唯一不受页面 CSP 约束的 MAIN world 注入方式。旧的 `contents/xiaohongshu-state.ts` 独立 content-script 方案已被 CSP 击败、已删除。

**硬约束（不要破坏）：**
- `stateInjector` 必须是**自包含函数**（`executeScript` 序列化整个函数体注入，不能闭包外部变量）。
- `document_start` 是必须的——要赶在页面赋值 `__INITIAL_STATE__` 之前装好拦截器。

`stateInjector` 拦截两条通路写入 localStorage：
- `__INITIAL_STATE__` 赋值拦截（独立详情页 SSR）→ `localStorage.__mc_state__`
- fetch/XHR 响应拦截（首页浮层 CSR）→ `localStorage.__mc_notes__`（LRU 上限 200，保留最新 150）

`lib/xhs-image-extractor.ts` 的 `getNoteMediaFromState(noteId)` 读取优先级：`__mc_notes__` 先（首页浮层最可靠），回退 `__mc_state__` / `window.__INITIAL_STATE__`（独立详情页 SSR）。`xhs-detail-collector.ts` 检测浮层/详情页 DOM、注入「采集素材」按钮，**不支持列表页 hover 采集。**

### Popup UI（效率优先资产管理台，M1 重设计）

`popup.tsx` 是 **460×660 紧凑密度**深色 UI（不是旧的 `AuthorGroup → NoteGroup → MediaCard` 三级折叠，也不是 Phase 5 早期的 Hero + AuthorCarousel 沉浸式版）。**主题 token 唯一权威源在 `lib/design-tokens.ts`（P3-19 迁入 + `darkTheme`/`lightTheme` 双主题），由 `lib/use-theme.tsx` 的 `ThemeProvider` 提供。所有组件经 `useTheme()` hook 消费，禁止内联 hex / magic value。**

Token 分组（`lib/design-tokens.ts`）：

| Token | 用途 | 档位 / 取值 |
|---|---|---|
| `r` | 圆角 | xs(5) / sm(8) / md(11) / lg(18) / pill |
| `sp` | 间距(8pt) | xxs / xs / sm / md / lg / xl / xxl |
| `btn` | 按钮尺寸 | xs(22) / sm(30) / md(38) / lg(40) |
| `fs` | 字号 | micro(11) → display(26) |
| `accent` | Action Blue `#0a84ff` | 选中态 / focus / 品牌强调（dark/light 同色） |
| `xhs` / `douyin` | 平台品牌色 | 平台 chip 激活态 |
| `ambient` | 顶部 radial 渐变 | 浮层/玻璃视觉协调 |
| `shadowCard` / `shadowFloat` | 阴影 | 卡片 / 浮动操作栏 |
| `focusRing` / `focusRingOffset` | 键盘焦点 | Apple Action Blue 2px 描边 + offset |

布局自顶向下（紧凑密度版）：

```
顶栏(品牌 logo + "素材库" + 数量角标 + 工具:打开素材库 / 主题切换 / 搜索)
  → [非搜索态] 数据看板(StatCard × 3:今日 / 总量 / 关注作者)
  → [searchOpen] 搜索框
  → [非搜索态] 筛选行:平台 chip(品牌色激活) + 类型 segmented control(📷/🎬)
  → [authorFilter] 作者筛选指示 chip
  → 滚动区:时间分节网格(今天 / 昨天 / 本周 / 更早,4 列 1:1 卡片)
      └─ MediaCard(.mc-card-art hover/press 反馈)
  → FloatBar(浮动玻璃操作栏:全选 / 导出 / 删除;0 选时 dashed 描边引导)
  → [undoToastVisible] Toast(底部 snackbar,5 秒「已删除 N 项」可撤销)
  → [downloadError] Toast(底部 snackbar,4 秒自动消失)
  → [previewItem] PreviewModal(全屏大图,左右切换 + 原帖链接)
  → [空] EmptyState(三步图示 + 快捷键提示)
```

> **M1 之前的 `Hero` / `AuthorCarousel` 组件已删除**(2026-06 cleanup),popup 不再有大图 Hero 与作者轮播。如需类似视觉效果,直接重写即可,无历史包袱。

**关键交互(2026-06 更新):**

- **删除流程**:FloatBar 点垃圾桶 → **立即删除** → 底部 Toast「已删除 N 项 撤销」(5 秒)。点击撤销通过 `RESTORE_ITEMS` 消息把原 `MediaItem[]` 写回 `chrome.storage.local`(`background/storage.ts` 的 `restoreItems()`,按 id 去重)。**不再使用**早期的"3 秒倒计时二次确认"机制。
- **类型筛选** 是 2 图标 segmented control(📷 图片 / 🎬 视频),单选 toggle。修复了早期"全部"在平台 + 类型两组重复出现的 UX bug。
- **主题切换**:顶栏第二个工具按钮,`auto` / `dark` / `light` 三态循环,持久化到 `chrome.storage.local[theme_mode]`,`auto` 模式跟随 `matchMedia("(prefers-color-scheme: dark)")`。
- **键盘快捷键** (`popup.tsx` 顶层 effect):
  - `Cmd/Ctrl+K` 切换搜索
  - `/` (非输入态) 打开搜索
  - `Esc` 关闭搜索;穿透到 PreviewModal 的 Esc 处理
- **a11y**:所有 icon 按钮带 `aria-label`;MediaCard 卡片区是 `role="button"` + Tab 可达;全局 `:focus-visible` 蓝色 ring 由 `injectPopupStyles()` 注入。

数据聚合全在 `popup.tsx` 的 `useMemo` 里(`authors` / `stats` / `noteImageCounts` / `filteredItems` / `timeBuckets`);`MediaItem._selected` 是 UI 态、不持久化。

**全屏素材库页(M2)**:独立 tab 页 `tabs/library.tsx`,左栏导航(全部/最近/未分类/收藏夹/平台) + 右侧主体(数据看板 + 密集网格 + 批量操作)。**M2 已上线**,popup 顶栏"打开素材库"工具按钮 → `chrome.tabs.create({url: "tabs/library.html"})`。

## ⚠️ 采集模式:点开笔记即采集(不支持列表页 hover)

**小红书只支持「点开笔记后一键采集」，不支持信息流瀑布流 hover 采集。** 点开笔记有两种场景，都已覆盖：

- **独立详情页**（直接打开笔记链接）：走 SSR 的 `window.__INITIAL_STATE__`（→ `__mc_state__`）。
- **首页浮层**（信息流点笔记弹出的 modal）：走 CSR，MAIN world 拦截 XHR/fetch 响应缓存（→ `__mc_notes__`）。

两者都含完整笔记元数据（图集全部图片 + 视频 stream），采集稳定、视频完整。

信息流瀑布流卡片只有封面图、视频元数据缺失；曾经尝试的列表页方案——hover + DOM 猜测 + `__mc_vurl_` 视频缓存（死代码，已删）+ API 预取（被 CSP 拦 / 反爬 `_sabo_*` 返回 500）——全部脆弱或失效，已统一移除。

**不要**重新引入列表页 hover 采集逻辑，除非确认 XHS 反爬策略已根本改变。

## Key Conventions

- **Inline styles only** — `React.CSSProperties` objects, injected `<style>` tags in content scripts. No CSS modules. `tailwind.config.js` and `style.css` are leftover scaffold artifacts, ignore them.
- **Path alias** — `~` maps to project root (e.g., `~/types`).
- **Storage writes** — all `chrome.storage.local` writes go through `enqueueWrite()` in `background/storage.ts` to serialize and prevent races.
- **Anti-hotlink downloads** — 实际下载在 background service worker：`background/download.ts` 的 `fetchAndDownload()` 接收 `DownloadFile[]`（`{ id?, url, filename, platform? }`），**逐项按自身 platform 计算 Referer**（修复混合平台批量导出取第一项的问题），`filename` 可含子目录最终落到 `MEDIA_COLLECTOR_DIR/<folder>/<name>`，因 SW 无 `URL.createObjectURL` 需把 blob 转 data URL（base64）再 `chrome.downloads`。成功项经 `storage.ts` 的 `markItemsExported()` 写入 `exportedAt`，全屏素材库「本周已导出」看板据此聚合。`SHOW_DOWNLOADS_FOLDER` 消息调 `chrome.downloads.showDefaultFolder()` 打开下载根目录（用户需再点进子目录）。`lib/base.ts` 的 `handleDownloadImages`（页面内 fetch + blob URL）+ `DOWNLOAD_IMAGES` 消息是遗留未接线代码（无发送方），不要假设它能用。
- **Context validity** — content scripts check `chrome.runtime?.id` before sending messages to handle extension reload.
- **UI language** — all user-facing text is Simplified Chinese.

## Constants and shared state

| Symbol | Location | Purpose |
|--------|----------|---------|
| `STORAGE_KEY` | `types.ts` | `chrome.storage.local` key for collected items |
| `MEDIA_COLLECTOR_DIR` | `types.ts` | download subfolder name (`media-collector/`) |
| `PLATFORM_LABELS` | `types.ts` | display labels for platforms |
| `MessageType` | `types.ts` | string union of background message types (含 `RESTORE_ITEMS`、`SHOW_DOWNLOADS_FOLDER`) |
| `MessagePayloads` | `types.ts` | per-message payload type map |
| `theme` | `lib/design-tokens.ts` | popup UI 主题 token 唯一权威源(`darkTheme` / `lightTheme` 双主题 + `ThemeTokens` 接口)。由 `lib/use-theme.tsx` 的 `ThemeProvider` 提供,组件经 `useTheme()` hook 消费 |
| `localStorage.__mc_state__` | `lib/xhs-state-inject.ts` | synced `__INITIAL_STATE__`（详情页 SSR，cross-world） |
| `localStorage.__mc_notes__` | `lib/xhs-state-inject.ts` | fetch/XHR 拦截缓存的笔记媒体（首页浮层 CSR，LRU 上限 200） |

## File routing reminder

Anything in `contents/*.ts` becomes a content script. Helpers shared between content scripts must live in `lib/` (not `contents/`) — otherwise they'd inject on every URL.