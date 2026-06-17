# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) built with Plasmo. Collects images/videos from Xiaohongshu (小红书) and Douyin (抖音). All user-facing UI text is Simplified Chinese.

## Development Commands

```bash
pnpm dev          # Dev server with HMR — load build/chrome-mv3-dev in Chrome
pnpm build        # Production build
pnpm package      # Build + zip for Chrome Web Store submission
```

No test suite or linter. Prettier is configured (`.prettierrc.mjs`).

## Release / publish to Chrome Web Store

Publishing is **manual**, via the `Submit to Web Store` GitHub Action (`.github/workflows/submit.yml`, triggered by `workflow_dispatch` — there is no local publish command). The workflow runs `pnpm build` → `pnpm package` → `PlasmoHQ/bpp` to upload `build/chrome-mv3-prod.zip`. It requires the `SUBMIT_KEYS` secret. Do not attempt to publish any other way.

## Architecture (high level)

Three-layer Chrome extension:

```
Content Scripts (contents/)  ←→  Background Service Worker (background/)  ←→  Popup UI (popup.tsx + components/)
```

- **Content scripts** (`contents/`) inject into target sites. `xiaohongshu.ts` runs the detail-page collector (injects a 「采集素材」 button into the note modal); `douyin.ts` uses hover detection. Each exports a `PlasmoCSConfig`.
- **Background** (`background/index.ts`) is the message router. It owns `chrome.storage` CRUD, download orchestration, context menus, keyboard shortcuts (`Ctrl/Cmd+Shift+S`), and — critically — **injects the MAIN-world state interceptor into XHS pages** via `chrome.scripting.executeScript`.
- **Popup** (`popup.tsx`) is a React UI (Apple Music-style immersive dark theme) showing collected items grouped by time bucket with an author carousel, hero card, and preview modal.

## Message flow

```
Content script → background: COLLECT_MEDIA / COLLECT_NOTE_IMAGES / INJECT_MAIN_WORLD
Background → chrome.storage.local → Popup (GET_ITEMS reads back)
Popup → background: GET_ITEMS / BATCH_DOWNLOAD / REMOVE_ITEMS / RESTORE_ITEMS / CLEAR_ITEMS
Background → content script: GET_LAST_MEDIA (keyboard shortcut queries last hovered media)
```

`RESTORE_ITEMS` is the **delete-undo channel**: popup backs up the items it just asked to delete, shows a `Toast`, and on undo sends `RESTORE_ITEMS` with the original `MediaItem[]`. The background calls `restoreItems()` (`background/storage.ts`) which merges by id (newest first), preserving the original `id` / `collectedAt` so undo restores the exact ordering.

Message types are a string union in `MessageType` (`types.ts`); per-message payload shapes are in `MessagePayloads`. When adding a new message type, update **both** `MessageType` and `MessagePayloads`, and the background `switch` handler narrows the payload with `as MessagePayloads["YOUR_TYPE"]`.

## Xiaohongshu MAIN-world injection (load-bearing — read this first)

This is the single most subtle part of the codebase. XHS note data lives in `window.__INITIAL_STATE__` (SSR detail page) and in XHR/fetch JSON responses (homepage modal, CSR). The ISOLATED-world content script cannot read MAIN-world state directly, and XHS's CSP blocks naive inline-script injection.

**Solution:** the MAIN-world interceptor is injected by the **background**, not by a separate content script:

1. `contents/xiaohongshu.ts` (ISOLATED world, `document_start`) sends `INJECT_MAIN_WORLD` on startup.
2. `background/index.ts` handles `INJECT_MAIN_WORLD` by calling `chrome.scripting.executeScript({ target: {tabId}, world: "MAIN", func: stateInjector, injectImmediately: true })`.
3. `stateInjector()` (in `lib/xhs-state-inject.ts`) runs in the page's MAIN world. `chrome.scripting.executeScript` is **not bound by the page's CSP** — this is the only reliable MV3 way to run code in the page context. It does two things:
   - **Path 1 — `__INITIAL_STATE__` intercept** (SSR detail page): wraps the property with `Object.defineProperty`, mirrors every assignment into `localStorage.__mc_state__`.
   - **Path 2 — fetch/XHR intercept** (homepage modal, CSR): clones JSON responses, extracts note media via `extractNoteMedia`, caches into `localStorage.__mc_notes__` (LRU, capped at 200 entries, keeps newest 150).
4. `getNoteMediaFromState(noteId)` (`lib/xhs-image-extractor.ts`) reads back: **`__mc_notes__` first** (most reliable for the homepage-modal case), falling back to `__mc_state__` / live `window.__INITIAL_STATE__` (SSR detail page).

**Hard constraints — do not break these:**

- `stateInjector` must be a **self-contained function**. `executeScript` serializes the function body and injects it — it cannot close over any module-scope variable. Anything it needs must be defined inside the function or read from `window`/`localStorage`.
- `xiaohongshu.ts` must run at `document_start` so the `INJECT_MAIN_WORLD` request reaches the background and the interceptor is installed **before** the page assigns `__INITIAL_STATE__`. Do not change this to `document_idle`.
- Do **not** reintroduce a `contents/xiaohongshu-state.ts` content-script approach (the old design). The page CSP defeats it; the `executeScript` route replaced it deliberately.
- Do **not** merge this interceptor logic into the ISOLATED-world script — it must run in the MAIN world, which only `executeScript({world:"MAIN"})` achieves.

## Xiaohongshu collection mode: detail page + homepage modal only

小红书**只支持笔记浮层/详情页采集**，不支持列表页 hover。`lib/xhs-detail-collector.ts` (`startDetailCollector`) detects the note modal via `MutationObserver` (throttled 200ms) + SPA route hooks (`pushState`/`replaceState` wrap + `popstate`) + an 800ms fallback poll. When a modal is visible it injects a 「采集素材」 button that follows the primary media element. On click → `getNoteMediaFromState(noteId)` → image set goes via `COLLECT_NOTE_IMAGES`, video via `COLLECT_MEDIA`.

Button positioning has a stability-confirmation step (same candidate position on two consecutive checks before showing) to avoid the button jumping from a wrong position to the right one during modal open animations.

The standalone detail-page case (direct note URL, no modal container) is handled by falling back to scanning `document` for the primary media element.

**Do not reintroduce list-page hover collection** — list-page waterfall cards only carry cover images and lack video metadata; prior list-page attempts (hover + DOM guessing + API prefetch) were fragile and blocked by XHS anti-scraping. This is intentional, not a gap.

## Popup UI (Apple Music style)

The popup was fully redesigned. It is **not** the old `AuthorGroup → NoteGroup → MediaCard` three-level folding list.

### Theme tokens (`lib/design-tokens.ts` + `lib/use-theme.tsx`) — **single source of truth**

> **迁移说明**:早期 token 在根目录 `popup-theme.ts`,P3-19 迁至 `lib/design-tokens.ts` 并加 `ThemeTokens` 接口 + `darkTheme`/`lightTheme` 双主题。组件经 `useTheme()` hook 消费(Provider 外 fallback 到 `darkTheme`,不会崩)。所有 token 改动改这两处即可,组件禁止内联 hex / magic number。

Token groups:

| Group | Keys | Purpose |
|---|---|---|
| Surface | `bg` / `bgGradient` / `card` / `cardHover` / `floatBar` | dark / light layered surfaces |
| Text | `textPrimary` / `textSecondary` / `textTertiary` | text hierarchy |
| Accent | `accent` (`#0a84ff`) / `accentFocus` / `accentDark` / `accentLight` | **Apple Action Blue** — used for selected rings, focus, brand accents; 同一取值在 dark/light 下保持一致 |
| Danger | `danger` / `dangerBg` / `dangerText` | independent of accent; delete / error states |
| Platform brand | `xhs` (`#FF2442`) / `xhsBg` / `douyin` (`#25F4EE` dark / `#0FB8B0` light) / `douyinBg` | chip active states |
| Radius | `r.xs`(5) / `r.sm`(8) / `r.md`(11) / `r.lg`(18) / `r.pill` | 5-tier scale — **don't add a 6th tier** |
| Spacing | `sp.xxs`(4) / `sp.xs`(8) / `sp.sm`(12) / `sp.md`(17) / `sp.lg`(24) / `sp.xl`(32) / `sp.xxl`(48) | 8pt scale |
| Button size | `btn.xs`(22) / `btn.sm`(30) / `btn.md`(38) / `btn.lg`(40) | 4-tier button size system |
| Font size | `fs.micro`(11) / `fs.caption`(12) / `fs.body`(14) / `fs.bodyLg`(15) / `fs.title`(17) / `fs.display`(26) | Apple type scale |
| Glass | `glass` / `glassBlur` / `glassBlurStrong` | liquid glass surface utilities |
| Shadow | `shadowCard` / `shadowFloat` | elevation shadows |
| Motion | `easeSpring` / `easeOut` / `durFast` / `dur` | timing tokens |
| Focus | `focusRing` / `focusRingOffset` | keyboard focus indicators |
| Ambient | `ambient` | 顶部 radial 渐变背景(浮层/玻璃视觉协调) |

Plus helpers: `getTimeBucket(collectedAt)` + `TIME_ORDER` for time bucketing (今天 / 昨天 / 本周 / 更早).

主题切换由 `lib/use-theme.tsx` 的 `ThemeProvider` 持有(支持 `auto` / `dark` / `light` 三态),用户选择持久化到 `chrome.storage.local[theme_mode]`,`auto` 模式下通过 `matchMedia("(prefers-color-scheme: dark)")` 跟随系统。

`popup.html` sets the 460px-wide, rounded, transparent, scrollbar-hidden popup shell.

### Component composition (`popup.tsx`)

Layout from top to bottom (the old `AuthorGroup → NoteGroup → MediaCard` is **gone**):

```
顶栏(品牌 logo + 大标题"素材" + 数量角标 + 搜索按钮)
  → [searchOpen?] 搜索框
  → [not searchOpen] 筛选行
      ├─ 平台 chip(全部 / 小红书 / 抖音,激活态用平台品牌色)
      ├─ 分隔线
      └─ 类型 segmented control(图标按钮:📷 图片 / 🎬 视频,单选切换)
  → [authorFilter?] 作者筛选指示 chip
  → Hero(最新带封面素材,16:9 + maxHeight 180,右上角 下载/原帖 快速操作)
  → 滚动区
      ├─ AuthorCarousel(圆形头像,渐变占位 + coverUrl 淡入,点击筛选)
      └─ 时间分节网格(每桶内按 collectedAt 倒序,MediaCard 1:1)
  → FloatBar(浮动玻璃操作栏:全选 / 批量下载 / 删除)
  → [undoToastVisible] Toast(底部 snackbar,5 秒可撤销)
  → [downloadError] Toast(底部 snackbar,4 秒自动消失)
  → [previewItem] PreviewModal(全屏大图,左右切换 + 原帖链接)
  → [items.length === 0] EmptyState(三步图示 + 快捷键提示)
```

### Interactions

- **Type filter** is a 2-icon segmented control (📷 / 🎬) — tapping the active icon deselects it (returns to "all"). The earlier "全部" appearing twice (platform + type) was a UX bug; fixed by removing the type filter's "全部" label.
- **Delete flow**: tapping trash in FloatBar → immediate delete + 5-second `Toast` at the bottom with an `撤销` button. The previous "click-twice-within-3-seconds" pattern (a thin red progress bar inside the button) was unintuitive and replaced.
- **Toast component** (`components/Toast.tsx`) is also used for `downloadError` (auto-dismiss, no action button).
- **Hero quick actions**: the hero now has 玻璃 fast-action buttons in the top-right (`下载` + `原帖`). `下载` on a note (`noteId` present) downloads the whole set; on a single image/video it downloads just that item.
- **Keyboard shortcuts** (`popup.tsx` effect):
  - `Cmd/Ctrl+K` — toggle search
  - `/` (outside input) — open search
  - `Esc` — close search; falls through to PreviewModal's own Esc handler for the preview overlay
- **Search activation collapses the filter row** (search focuses the user on results; the filter chips hide until search is closed).
- **Platform chips are color-coded**: 小红书 → `#FF2442` background tint + red text; 抖音 → `#25F4EE` cyan tint + cyan text. "全部" uses the Apple Blue accent.

### Accessibility

- All icon-only buttons carry `aria-label` (and most also expose `aria-pressed` for toggle state).
- `Hero` and `MediaCard` art surfaces are keyboard-activatable (`role="button"`, `tabIndex={0}`, Enter / Space handlers).
- A global `:focus-visible` ring (Apple Action Blue, 2px outline + offset) is injected by `injectPopupStyles()` so Tab navigation is visible.
- `MediaCard` hover/press: the `.mc-card-art` CSS class (injected by the same `injectPopupStyles`) gives hover lift + shadow and active scale-down.

### Data flow

All data aggregation lives in `popup.tsx` `useMemo`s: `heroItem`, `authors` (count + "未分类"/empty-author sinks to bottom), `noteImageCounts`, `filteredItems` (search + author + platform + type), `timeBuckets`.

`MediaItem._selected` is UI-only state (not persisted); selection lives in the React state, downloads/deletes re-read fresh data from the background via `GET_ITEMS`.

## Key Conventions

**Plasmo file-based routing:**
- `contents/*.ts` auto-registers as content scripts.
- `lib/base.ts` is in `lib/` (not `contents/`) — this prevents it being injected on every URL. Any helper shared between content scripts must live in `lib/`, never `contents/`.
- `background/index.ts` is the service worker.
- `popup.tsx` at root is the popup entry.
- Path alias `~` maps to project root.

**Inline styles only:** All React components use `React.CSSProperties` objects. Content-script UI uses injected `<style>` tags. No CSS modules, no Tailwind. `tailwind.config.js` and `style.css` are leftover scaffold artifacts — leave them alone.

**Storage write queue:** `enqueueWrite()` in `background/storage.ts` serializes all `chrome.storage.local` writes. Don't bypass it.

**Downloads — actual path:** The only wired-up download route runs in the **background service worker**: `background/download.ts` `fetchAndDownload(files: DownloadFile[])` fetches each file with a **per-item platform-matching `Referer`** header (bypasses CDN referrer checks; M4 fixed the old bug of using only the first item's platform for mixed-platform batches), then — because a service worker has no `URL.createObjectURL` — converts the blob to a **data URL (base64)** before `chrome.downloads.download`. `DownloadFile.filename` may include a subfolder, so files land at `MEDIA_COLLECTOR_DIR/<folder>/<name>`. After a successful download, `markItemsExported(ids, exportedAt)` (in `background/storage.ts`, via `enqueueWrite`) stamps `MediaItem.exportedAt`; the fullscreen library's 「本周已导出」 stat card aggregates on it. 300ms spacing avoids Chrome throttle. The library's 「打开文件夹」 Toast action sends `SHOW_DOWNLOADS_FOLDER`, handled in the background by `chrome.downloads.showDefaultFolder()` — note it opens the **download root**, not the specific `media-collector/<folder>/` subfolder.

**Downloads — dead/legacy code (do not assume it works):** `lib/base.ts` `handleDownloadImages` / `registerDownloadHandler` / `registerContentMessageHandler` listen for a `DOWNLOAD_IMAGES` message (page-context fetch + blob URL + `chrome.downloads`), and the content scripts register these listeners — but **nothing sends `DOWNLOAD_IMAGES`** (it is not even in the `MessageType` union). Likewise `DOWNLOAD_ITEM` / `downloadSingle` is implemented in the background but never called from the popup. If you touch downloads, work from `fetchAndDownload` (SW path), and consider whether the page-context path should be wired up for cookie-restricted media or removed entirely.

**Anti-hotlink context validity:** Content scripts must check `chrome.runtime?.id` before `sendMessage`. Extension reload invalidates the old context and subsequent sends would throw.

**Download path constant:** All downloads go to `MEDIA_COLLECTOR_DIR` in `types.ts` (currently `"media-collector"`). Single source of truth — don't hardcode the string elsewhere.

## TypeScript Config

Strict mode, ESNext target, bundler module resolution. `types.ts` holds the shared types and constants: `MediaItem`, `MessageType`, `MessagePayloads`, `MessageResponse`, `STORAGE_KEY`, `MEDIA_COLLECTOR_DIR`, `PLATFORM_LABELS`.

## Debugging

- Dev server `pnpm dev` rebuilds on file change. Reload the extension in `chrome://extensions` to pick up new content script bundles (auto-reload does NOT happen for content scripts).
- Content script console: the XHS/Douyin page's DevTools console.
- Background (service worker) console: open `chrome://extensions` → your extension → "Service worker" link.
- The MAIN-world interceptor (`stateInjector`) logs into the **page** console (not the extension's), since it runs in the page context.
- The dev bundle lives in `build/chrome-mv3-dev/`. Hash-suffixed JS filenames change between rebuilds — to force a fresh load, "Remove" the extension and re-load the unpacked folder.

## Related docs (keep in sync)

- **`AGENTS.md`** — the concise, agent-facing authoritative version of the architecture and constraints. This file (`CLAUDE.md`) is the longer companion with implementation detail; AGENTS.md is the short reference.
- **`README.md`** — user/developer-facing overview and the file tree.
- **`DESIGN.md` / `LESSONS.md`** — design rationale and the running log of lessons learned (why things are the way they are).

All three describe the same current architecture: MAIN-world `executeScript` injection, the Apple Music-style popup, and the background-service-worker download path. When you change architecture, update all three — they drifted out of sync once before (a deleted `xiaohongshu-state.ts`, the old `AuthorGroup → NoteGroup → MediaCard` popup, `document_idle`) and it caused confusion.
