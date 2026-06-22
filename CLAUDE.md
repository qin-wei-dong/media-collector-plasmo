# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Chrome extension (Manifest V3) built with Plasmo. Collects images/videos from Xiaohongshu (小红书). All user-facing UI text is Simplified Chinese.

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
Content Scripts (contents/)  ←→  Background Service Worker (background/)  ←→  Library UI (tabs/library.tsx + components/)
```

- **Content scripts** (`contents/`) inject into target sites. `xiaohongshu.ts` runs the detail-page collector (injects a 「采集素材」 button into the note modal). Each exports a `PlasmoCSConfig`.
- **Background** (`background/index.ts`) is the message router. It owns `chrome.storage` CRUD, download orchestration, context menus, keyboard shortcuts (`Ctrl/Cmd+Shift+S`), and — critically — **injects the MAIN-world state interceptor into XHS pages** via `chrome.scripting.executeScript`.
- **Library UI** (`tabs/library.tsx`) is the current React UI for the release build. It is the full-screen workbench for browsing, filtering, previewing, exporting, and managing collected items.

## Message flow

```
Content script → background: COLLECT_MEDIA / COLLECT_NOTE_IMAGES / INJECT_MAIN_WORLD
Background → chrome.storage.local → Library UI (GET_ITEMS reads back)
Library UI → background: GET_ITEMS / BATCH_DOWNLOAD / REMOVE_ITEMS / RESTORE_ITEMS / CLEAR_ITEMS
Background → content script: COLLECT_CURRENT_NOTE (Ctrl/Cmd+Shift+S shortcut — content script runs `collectCurrentNote()` on the current note modal/page and replies `{handled, ok}`; background only shows a fallback notice if `handled` is falsy)
```

`RESTORE_ITEMS` is the **delete-undo channel**: the library backs up the items it just asked to delete, shows a `Toast`, and on undo sends `RESTORE_ITEMS` with the original `MediaItem[]`. The background calls `restoreItems()` (`background/storage.ts`) which merges by id (newest first), preserving the original `id` / `collectedAt` so undo restores the exact ordering.

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

## Library UI

The library UI is the release surface. It is **not** the old `AuthorGroup → NoteGroup → MediaCard` three-level folding list.

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

### Component composition (`tabs/library.tsx`)

Layout from top to bottom (the old `AuthorGroup → NoteGroup → MediaCard` is **gone**; the old popup 弹窗 was deleted in v2.1.0 — `chrome.action.onClicked` now opens this full-screen tab directly, there is no popup):

```
左侧栏(全部 / 最近 / 未分类 / 收藏夹 / 平台)
  → 顶部 toolbar(标题 + 搜索 + 导出历史 + 排序 + 视图切换 + 主题切换)
  → 数据看板(今日采集 / 素材总量 / 关注作者 / 本周已导出)
  → subbar(平台 / 类型筛选 + 已显示计数 + 批量操作)
  → 滚动区:时间分节网格或列表(渐进渲染,INITIAL_RENDER_COUNT=160 + 滚动追加 120)
  → [previewItem] PreviewModal(全屏预览,同笔记图片左右切换)
  → [dialog] CollectionDialog / ExportHistoryModal
  → [notice] LibraryToast(删除撤销 / 导出反馈 / 错误共用)
```

> `library.tsx` is a single ~3000-line file (40 symbols). The historical `StatCard / MediaCard / FloatBar / EmptyState / Toast` components are inlined here, not separate files — `components/` currently holds only `PreviewModal.tsx`. Splitting this file is a P1 cleanup candidate.

### Interactions

- **Type filter** is a 2-icon segmented control (📷 / 🎬) — tapping the active icon deselects it (returns to "all"). The earlier "全部" appearing twice (platform + type) was a UX bug; fixed by removing the type filter's "全部" label.
- **Delete flow**: tapping trash in FloatBar → **immediate delete** + 5-second `LibraryToast` at the bottom with an `撤销` button. On undo the library sends `RESTORE_ITEMS` with the original `MediaItem[]`; `background/storage.ts` `restoreItems()` merges by id (preserving original `id`/`collectedAt`), so ordering is restored exactly. The previous "click-twice-within-3-seconds" pattern was unintuitive and replaced (see LESSONS 坑 12).
- **Theme toggle**: the toolbar's theme button cycles `auto` / `dark` / `light`, persisted to `chrome.storage.local[theme_mode]`; `auto` follows `matchMedia("(prefers-color-scheme: dark)")`.
- **LibraryToast** (the `notice` state in `library.tsx`) is the shared snackbar — delete-undo (action button), export feedback (`已导出 N 项到 素材库/<folder>/`), and download errors (auto-dismiss, no action).
- **Keyboard shortcuts** (`tabs/library.tsx` effect; input/textarea/contenteditable excluded unless noted):
  - `Cmd/Ctrl+K` — focus search
  - `Cmd/Ctrl+A` — select all filtered items
  - `E` — export selected / `C` — open collection dialog
  - `Delete` / `Backspace` — delete selected (goes through the undo Toast)
  - `Esc` — priority: dialog > preview > search (dialog uses capture phase)
- **Platform chips are color-coded**: 小红书 → `#FF2442` background tint + red text. "全部" uses the Apple Blue accent.

### Accessibility

- All icon-only buttons carry `aria-label` (and most also expose `aria-pressed` for toggle state).
- `LibraryCell` / `LibraryRow` art surfaces are keyboard-activatable (`role="button"`, `tabIndex={0}`, Enter / Space handlers).
- A global `:focus-visible` ring (Apple Action Blue, 2px outline + offset) is injected by `injectLibraryStyles()` so Tab navigation is visible.
- Cell hover/press: the `.mc-library-cell` / `.mc-library-button` CSS classes (injected by the same `injectLibraryStyles`) give hover lift + shadow and active scale-down.
- `pnpm audit:a11y` runs axe-core against the library harness (`scripts/a11y-audit.mjs`, puppeteer-core + system Chrome).

### Data flow

All data aggregation lives in `tabs/library.tsx` `useMemo`s: `enrichedItems` (预计算 `_collectedAtMs` / `_timeBucket` / `_searchHaystack`,供下游 6 处复用) → `authors` / `stats` / `sidebarCounts` / `collectionCounts` / `noteImageCounts` / `filteredItems` / `sortedItems` / `visibleItems` (渐进渲染切片) / `buckets` (时间分节). Switching any filter clears `selectedIds` via `useEffect` (returns the same ref when already empty → React bail-out); stale ids are pruned when `items` change.

`selectedIds` is UI-only state (not persisted); `selectedCount = selectedItems.length` (not `selectedIds.size`) to avoid transient mismatch when items change. Batch ops (export / delete / assign) clear selection on success and re-read fresh data from the background via `GET_ITEMS`.

## Key Conventions

**Plasmo file-based routing:**
- `contents/*.ts` auto-registers as content scripts.
- `lib/base.ts` is in `lib/` (not `contents/`) — this prevents it being injected on every URL. Any helper shared between content scripts must live in `lib/`, never `contents/`.
- `background/index.ts` is the service worker.
- `tabs/library.tsx` is the library entry.
- Path alias `~` maps to project root.

**Inline styles only:** All React components use `React.CSSProperties` objects. Content-script UI uses injected `<style>` tags. No CSS modules, no Tailwind (the early scaffold's `tailwind.config.js` / `style.css` were removed long ago).

**Storage write queue:** `enqueueWrite()` in `background/storage.ts` serializes all `chrome.storage.local` writes. Don't bypass it.

**Downloads — actual path:** The only wired-up download route runs in the **background service worker**: `background/download.ts` `fetchAndDownload(files: DownloadFile[])` fetches each file with a `Referer` header (the public release converged on a single XHS Referer after M7 platform scoping — `refererFor()` ignores `platform`), then — because a service worker has no `URL.createObjectURL` — converts the blob to a **data URL (base64)** via `FileReader` before `chrome.downloads.download`. `DownloadFile.filename` may include a subfolder, so files land at `MEDIA_COLLECTOR_DIR/<folder>/<name>`. After a successful download, `markItemsExported(ids, exportedAt)` (in `background/storage.ts`, via `enqueueWrite`) stamps `MediaItem.exportedAt`; the fullscreen library's 「本周已导出」 stat card aggregates on it. **800ms spacing** between files mitigates CDN rate-limiting — M6 determined that batch partial-failures were CDN throttling (429/403), not hotlinking or OOM, so the fix was spacing + a 1.5s single retry rather than an architecture change. Each download also has a 15s `onChanged` fallback so the queue can't stall. The library's 「打开下载目录」 Toast action sends `SHOW_DOWNLOADS_FOLDER`, handled in the background by `chrome.downloads.showDefaultFolder()` — note it opens the **download root**, not the specific `media-collector/<folder>/` subfolder.

**Downloads — historical dead code (cleaned up 2026-06):** `lib/base.ts` previously held a page-context download/hover path (`HoverUIManager`, `detectMediaAtPoint`, `extractTitle`, `registerContentMessageHandler`) left over from the abandoned list-page hover design — all had zero callers and were removed. `base.ts` now keeps only `injectStyles` (toast styles) / `showToast` / `isContextValid`, shared by the detail collector (`lib/xhs-detail-collector.ts`). The only live download route is the SW `fetchAndDownload` path above.

**Anti-hotlink context validity:** Content scripts must check `chrome.runtime?.id` before `sendMessage`. Extension reload invalidates the old context and subsequent sends would throw.

**Download path constant:** All downloads go to `MEDIA_COLLECTOR_DIR` in `types.ts` (currently `"media-collector"`). Single source of truth — don't hardcode the string elsewhere.

## TypeScript Config

Strict mode, ESNext target, bundler module resolution. `types.ts` holds the shared types and constants: `MediaItem`, `MessageType`, `MessagePayloads`, `MessageResponse`, `STORAGE_KEY`, `MEDIA_COLLECTOR_DIR`, `PLATFORM_LABELS`.

## Debugging

- Dev server `pnpm dev` rebuilds on file change. Reload the extension in `chrome://extensions` to pick up new content script bundles (auto-reload does NOT happen for content scripts).
- Content script console: the XHS page's DevTools console.
- Background (service worker) console: open `chrome://extensions` → your extension → "Service worker" link.
- The MAIN-world interceptor (`stateInjector`) logs into the **page** console (not the extension's), since it runs in the page context.
- The dev bundle lives in `build/chrome-mv3-dev/`. Hash-suffixed JS filenames change between rebuilds — to force a fresh load, "Remove" the extension and re-load the unpacked folder.

## Related docs (keep in sync)

- **`AGENTS.md`** — the concise, agent-facing authoritative version of the architecture and constraints. This file (`CLAUDE.md`) is the longer companion with implementation detail; AGENTS.md is the short reference.
- **`README.md`** — user/developer-facing overview and the file tree.
- **`DESIGN.md` / `LESSONS.md`** — design rationale and the running log of lessons learned (why things are the way they are).

All three describe the same current architecture: MAIN-world `executeScript` injection, the library UI, and the background-service-worker download path. When you change architecture, update all three — they drifted out of sync once before (a deleted `xiaohongshu-state.ts`, the old `AuthorGroup → NoteGroup → MediaCard` UI, `document_idle`) and it caused confusion.

## Verification commands (M5+)

```bash
pnpm build            # Plasmo build,必须成功
pnpm test             # vitest 单元测试(纯逻辑)
pnpm audit:a11y       # axe-core a11y 审计(覆盖 library harness)
```

M5 阶段引入了 `tabs/library.tsx` 全屏素材库 + a11y/视觉/响应式收口。完整验收清单见 `docs/superpowers/plans/2026-06-17-m5-stability-polish-implementation.md` 第 6 节。
