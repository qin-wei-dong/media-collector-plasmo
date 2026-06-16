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

### Popup UI（Apple Music 风）

`popup.tsx` 是 Apple Music 沉浸风深色 UI（不是旧的 `AuthorGroup → NoteGroup → MediaCard` 三级折叠，那些组件已删除）。主题 token 在 `popup-theme.ts`，容器在 `popup.html`。布局自顶向下：

```
顶栏（大标题"素材" + 计数 + 搜索）+ 搜索框 + 平台/类型筛选 chip + 作者筛选指示
  → Hero（最新带封面素材大图）
  → AuthorCarousel（作者头像横向轮播，点击按作者筛选）
  → 时间分节网格（今天/昨天/本周/更早，popup-theme.ts 的 getTimeBucket）
      └─ MediaCard（每桶内按 collectedAt 倒序）
  → FloatBar（浮动操作栏：全选 / 批量下载 / 删除）
  → PreviewModal（大图预览，同 noteId 兄弟图左右切换）
```

数据聚合全在 `popup.tsx` 的 `useMemo` 里（heroItem / authors / noteImageCounts / filteredItems / timeBuckets）；`MediaItem._selected` 是 UI 态、不持久化。

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
- **Anti-hotlink downloads** — 实际下载在 background service worker：`background/download.ts` 用 `fetch()` 带平台匹配的 `Referer` header 绕 CDN 防盗链，因 SW 无 `URL.createObjectURL` 需把 blob 转 data URL（base64）再 `chrome.downloads`，下载到 `types.ts` 的 `MEDIA_COLLECTOR_DIR`。`lib/base.ts` 的 `handleDownloadImages`（页面内 fetch + blob URL）+ `DOWNLOAD_IMAGES` 消息是遗留未接线代码（无发送方），不要假设它能用。
- **Context validity** — content scripts check `chrome.runtime?.id` before sending messages to handle extension reload.
- **UI language** — all user-facing text is Simplified Chinese.

## Constants and shared state

| Symbol | Location | Purpose |
|--------|----------|---------|
| `STORAGE_KEY` | `types.ts` | `chrome.storage.local` key for collected items |
| `MEDIA_COLLECTOR_DIR` | `types.ts` | download subfolder name (`media-collector/`) |
| `PLATFORM_LABELS` | `types.ts` | display labels for platforms |
| `MessageType` | `types.ts` | string union of background message types |
| `MessagePayloads` | `types.ts` | per-message payload type map |
| `localStorage.__mc_state__` | `lib/xhs-state-inject.ts` | synced `__INITIAL_STATE__`（详情页 SSR，cross-world） |
| `localStorage.__mc_notes__` | `lib/xhs-state-inject.ts` | fetch/XHR 拦截缓存的笔记媒体（首页浮层 CSR，LRU 上限 200） |

## File routing reminder

Anything in `contents/*.ts` becomes a content script. Helpers shared between content scripts must live in `lib/` (not `contents/`) — otherwise they'd inject on every URL.