# 素材采集助手 v2.0 架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 v1.0 的单文件架构重构为模块化结构，新增小红书多图提取能力，并增强弹窗 UI（平台筛选、笔记分组视图）。

**Architecture:** 按平台拆分 content scripts（base 共享 + 各平台独立），background 按职责拆分为路由/存储/下载三个模块，popup 组件化（MediaCard/BatchBar/PlatformFilter），数据模型扩展支持多图笔记分组。

**Tech Stack:** Plasmo 0.90.5, React 18, TypeScript 5, Chrome Extension Manifest V3

---

## 文件结构

```
media-collector-plasmo/
├── contents/                    ← 多平台 content scripts
│   ├── base.ts                  ← 共享：悬停检测、按钮渲染、Toast、样式注入
│   ├── xiaohongshu.ts           ← 小红书：单图采集 + 多图笔记提取
│   └── douyin.ts                ← 抖音：视频采集（v2.0 先保持 v1.0 逻辑）
├── background/
│   ├── index.ts                 ← 消息路由 + 安装初始化
│   ├── storage.ts               ← 存储 CRUD（增删查清 + 去重）
│   └── download.ts              ← 单条/批量下载
├── components/
│   ├── MediaCard.tsx            ← 素材卡片组件
│   ├── BatchBar.tsx             ← 批量操作栏组件
│   ├── PlatformFilter.tsx       ← 平台筛选组件
│   └── NoteGroup.tsx            ← 笔记分组折叠组件（v2 新增）
├── types.ts                     ← 共享类型定义
├── popup.tsx                    ← 弹窗主组件（重组后）
└── package.json                 ← 更新 manifest 配置
```

---

### Task 1: 添加共享类型定义

**Files:**
- Create: `types.ts`

- [ ] **Step 1: 创建共享类型文件**

```typescript
// types.ts — 素材采集助手共享类型定义

export interface MediaItem {
  id: string
  url: string
  type: "image" | "video"
  platform: "xiaohongshu" | "douyin" | "unknown"
  title: string
  sourceUrl: string
  collectedAt: string

  // v2 新增
  originalUrl?: string
  coverUrl?: string
  author?: string
  duration?: number
  width?: number
  height?: number
  noteId?: string
  groupIndex?: number

  // UI 状态（不持久化）
  _selected?: boolean
}

export type MessageType =
  | "COLLECT_MEDIA"
  | "COLLECT_NOTE_IMAGES"
  | "GET_ITEMS"
  | "CLEAR_ITEMS"
  | "DOWNLOAD_ITEM"
  | "BATCH_DOWNLOAD"
  | "GET_LAST_MEDIA"

export interface MessagePayloads {
  COLLECT_MEDIA: {
    url: string
    type: string
    platform: string
    title: string
    sourceUrl: string
    noteId?: string
    groupIndex?: number
    width?: number
    height?: number
  }
  COLLECT_NOTE_IMAGES: {
    noteId: string
    images: Array<{
      url: string
      width?: number
      height?: number
      groupIndex: number
    }>
    title: string
    sourceUrl: string
  }
  GET_ITEMS: void
  CLEAR_ITEMS: void
  DOWNLOAD_ITEM: { url: string; filename: string }
  BATCH_DOWNLOAD: Array<{ url: string; filename: string }>
  GET_LAST_MEDIA: void
}

export interface MessageResponse {
  success: boolean
  error?: string
  items?: MediaItem[]
  item?: MediaItem
  downloadId?: number
  count?: number
  errors?: string[]
  media?: {
    url: string
    type: string
    platform: string
    title: string
    sourceUrl: string
  } | null
}

export const STORAGE_KEY = "collected_media"

export const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  unknown: "未知",
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit types.ts`
Expected: No errors (types.ts has no runtime code that depends on Chrome APIs)

- [ ] **Step 3: 提交**

```bash
git add types.ts
git commit -m "feat: add shared type definitions for v2.0"
```

---

### Task 2: 拆分 background — 存储模块

**Files:**
- Create: `background/storage.ts`
- Modify: `background/index.ts` (import storage)

- [ ] **Step 1: 创建 storage.ts**

```typescript
// background/storage.ts — 存储 CRUD 操作
import { type MediaItem, STORAGE_KEY } from "../types"

export function getItems(): Promise<MediaItem[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as MediaItem[]) || [])
    })
  })
}

export function saveItem(item: MediaItem): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      if (items.some((existing) => existing.url === item.url)) {
        resolve({ success: false, error: "已存在" })
        return
      }
      items.unshift(item)
      chrome.storage.local.set({ [STORAGE_KEY]: items }, () => {
        resolve({ success: true })
      })
    })
  })
}

export function saveItems(newItems: MediaItem[]): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      const existingUrls = new Set(items.map((i) => i.url))
      const toAdd = newItems.filter((item) => !existingUrls.has(item.url))
      const merged = [...toAdd, ...items]
      chrome.storage.local.set({ [STORAGE_KEY]: merged }, () => {
        resolve({ success: true })
      })
    })
  })
}

export function clearItems(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: [] }, () => resolve())
  })
}

export function removeItem(id: string): Promise<void> {
  return new Promise((resolve) => {
    getItems().then((items) => {
      const filtered = items.filter((i) => i.id !== id)
      chrome.storage.local.set({ [STORAGE_KEY]: filtered }, () => resolve())
    })
  })
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit background/storage.ts`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add background/storage.ts
git commit -m "feat: extract storage module from background"
```

---

### Task 3: 拆分 background — 下载模块

**Files:**
- Create: `background/download.ts`

- [ ] **Step 1: 创建 download.ts**

```typescript
// background/download.ts — 下载操作
import { showNote } from "./index"

export function downloadSingle(
  url: string,
  filename: string
): Promise<{ success: boolean; downloadId?: number; error?: string }> {
  return new Promise((resolve) => {
    chrome.downloads.download(
      {
        url,
        filename: "media-collector/" + (filename || "素材"),
        saveAs: true,
      },
      (downloadId) => {
        const err = chrome.runtime.lastError
        resolve({ success: !err, downloadId, error: err?.message })
      }
    )
  })
}

export function batchDownload(
  files: { url: string; filename: string }[]
): Promise<{ success: boolean; count?: number; errors?: string[] }> {
  return new Promise((resolve) => {
    if (!files?.length) {
      resolve({ success: false })
      return
    }

    let completed = 0
    const errors: string[] = []

    files.forEach((file) => {
      chrome.downloads.download(
        {
          url: file.url,
          filename: "media-collector/" + (file.filename || "素材"),
          saveAs: false,
        },
        () => {
          const err = chrome.runtime.lastError
          if (err) errors.push(file.filename + ": " + err.message)
          completed++

          if (completed === files.length) {
            if (errors.length === 0) {
              showNote("✅ 批量下载完成", `共 ${files.length} 个文件已保存到 media-collector 文件夹`)
              resolve({ success: true, count: files.length })
            } else if (errors.length < files.length) {
              showNote("⚠️ 部分下载失败", `成功 ${files.length - errors.length} / ${files.length}`)
              resolve({ success: true, count: files.length - errors.length, errors })
            } else {
              showNote("❌ 下载失败", errors[0])
              resolve({ success: false, errors })
            }
          }
        }
      )
    })
  })
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit background/download.ts`
Expected: Error about importing `showNote` from `./index` — this is expected since index.ts doesn't exist as a module yet. We'll fix this when we refactor index.ts.

- [ ] **Step 3: 提交**

```bash
git add background/download.ts
git commit -m "feat: extract download module from background"
```

---

### Task 4: 重构 background/index.ts — 消息路由

**Files:**
- Modify: `background/index.ts` (rename from `background.ts`)
- Modify: `package.json` (update background path)

- [ ] **Step 1: 移动文件并重写 background/index.ts**

```bash
mv background.ts background/index.ts
```

然后替换 `background/index.ts` 内容：

```typescript
// background/index.ts — 消息路由 + 安装初始化
import { type MediaItem, STORAGE_KEY } from "../types"
import { getItems, saveItem, saveItems, clearItems } from "./storage"
import { downloadSingle, batchDownload } from "./download"

// ====== 工具函数（模块内共享） ======
export function showNote(title: string, msg: string) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title,
    message: msg,
  })
}

function getPlatform(url?: string): string {
  if (!url) return "unknown"
  if (url.includes("xiaohongshu.com")) return "xiaohongshu"
  if (url.includes("douyin.com")) return "douyin"
  return "unknown"
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ====== 安装 ======
chrome.runtime.onInstalled.addListener(() => {
  console.log("素材采集助手已安装")

  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (!result[STORAGE_KEY]) {
      chrome.storage.local.set({ [STORAGE_KEY]: [] })
    }
  })

  chrome.contextMenus.create({
    id: "collect_media",
    title: "📥 采集此素材",
    contexts: ["image", "video"],
  })
})

// ====== 右键菜单 ======
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "collect_media") return
  if (!info.srcUrl) return

  collectAndNotify({
    url: info.srcUrl,
    type: info.mediaType === "video" ? "video" : "image",
    platform: getPlatform(tab?.url),
    title: tab?.title || "",
    sourceUrl: tab?.url || "",
  })
})

// ====== 快捷键 ======
chrome.commands.onCommand.addListener((command) => {
  if (command !== "collect_media") return

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0]
    if (!tab?.id) return

    chrome.tabs.sendMessage(tab.id, { type: "GET_LAST_MEDIA" }, (response) => {
      if (response?.media) {
        collectAndNotify(response.media)
      } else {
        showNote("未检测到素材", "请先将鼠标悬停在图片/视频上")
      }
    })
  })
})

// ====== 消息处理 ======
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "COLLECT_MEDIA":
      collectAndNotify(message.payload, (result) => sendResponse(result))
      return true

    case "COLLECT_NOTE_IMAGES": {
      const { noteId, images, title, sourceUrl } = message.payload
      const newItems: MediaItem[] = images.map((img: any, i: number) => ({
        id: generateId(),
        url: img.url,
        type: "image" as const,
        platform: "xiaohongshu" as const,
        title: title || "未命名笔记",
        sourceUrl,
        collectedAt: new Date().toISOString(),
        noteId,
        groupIndex: img.groupIndex ?? i,
        width: img.width,
        height: img.height,
      }))
      saveItems(newItems).then((result) => {
        showNote("✅ 笔记采集完成", `已采集 ${images.length} 张图片`)
        sendResponse(result)
      })
      return true
    }

    case "GET_ITEMS":
      getItems().then((items) => sendResponse({ success: true, items }))
      return true

    case "CLEAR_ITEMS":
      clearItems().then(() => sendResponse({ success: true }))
      return true

    case "DOWNLOAD_ITEM":
      downloadSingle(message.payload.url, message.payload.filename).then((result) =>
        sendResponse(result)
      )
      return true

    case "BATCH_DOWNLOAD":
      batchDownload(message.payload).then((result) => sendResponse(result))
      return true

    default:
      sendResponse({ success: false })
      return false
  }
})

// ====== 采集核心 ======
function collectAndNotify(
  mediaData: {
    url: string
    type: string
    platform: string
    title: string
    sourceUrl: string
    noteId?: string
    groupIndex?: number
    width?: number
    height?: number
  },
  callback?: (result: { success: boolean; error?: string; item?: MediaItem }) => void
) {
  const newItem: MediaItem = {
    id: generateId(),
    url: mediaData.url,
    type: (mediaData.type || "image") as "image" | "video",
    platform: (mediaData.platform || "unknown") as "xiaohongshu" | "douyin" | "unknown",
    title: (mediaData.title || "").slice(0, 200),
    sourceUrl: mediaData.sourceUrl || "",
    collectedAt: new Date().toISOString(),
    noteId: mediaData.noteId,
    groupIndex: mediaData.groupIndex,
    width: mediaData.width,
    height: mediaData.height,
  }

  saveItem(newItem).then((result) => {
    if (result.success) {
      showNote("✅ 采集成功", mediaData.title || "素材已添加")
    } else {
      showNote("已存在", "该素材已在采集列表中")
    }
    callback?.({ success: result.success, error: result.error, item: newItem })
  })
}
```

- [ ] **Step 2: 更新 package.json 中的 background 路径**

将 `package.json` 中的背景脚本配置更新为（Plasmo 默认使用 `background/index.ts`，但需要确认）。实际上 Plasmo 默认会从根目录的 `background.ts` 或 `background/index.ts` 检测。由于我们把文件移到了 `background/index.ts`，需要删除旧的 `background.ts` 引用。

不需要修改 `package.json`，Plasmo 会自动检测 `background/index.ts`。

- [ ] **Step 3: 验证编译**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit`
Expected: May show some errors related to content.ts changes not yet made. Focus on ensuring background/ directory has no errors.

- [ ] **Step 4: 提交**

```bash
git add background/index.ts storage.ts download.ts types.ts
git rm background.ts
git add -u
git commit -m "refactor: split background into routing, storage, and download modules"
```

---

### Task 5: 拆分 content scripts — 共享基础模块

**Files:**
- Create: `contents/base.ts`

- [ ] **Step 1: 创建 contents/base.ts**

```typescript
// contents/base.ts — 共享：悬停检测、按钮渲染、Toast、样式注入
// 不导出 PlasmoCSConfig，由各平台 content script 自行配置

export function injectStyles() {
  const style = document.createElement("style")
  style.textContent = `
    #__mc_highlight {
      position:fixed; z-index:2147483645;
      border:2px solid #ff2d55; border-radius:4px;
      pointer-events:none; opacity:0;
      transition:opacity 0.1s;
      box-shadow:0 0 0 4px rgba(255,45,85,0.15);
    }
    #__mc_highlight.mc_on { opacity:1; }
    #__mc_btn {
      position:fixed; z-index:2147483647;
      background:linear-gradient(135deg,#ff2d55,#ff6b81);
      color:#fff; border:none; border-radius:0 0 14px 14px;
      padding:10px 32px; font-size:14px; font-weight:600;
      cursor:pointer; white-space:nowrap; letter-spacing:0.5px;
      box-shadow:0 4px 14px rgba(255,45,85,0.4);
      opacity:0; pointer-events:none;
      transition:opacity 0.1s, transform 0.12s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      transform:translateX(-50%);
    }
    #__mc_btn.mc_on { opacity:1; pointer-events:auto; }
    #__mc_btn:hover { transform:translateX(-50%) scale(1.04); box-shadow:0 5px 18px rgba(255,45,85,0.55); }
    #__mc_btn:active { transform:translateX(-50%) scale(0.96); }
    #__mc_btn.mc_done { background:linear-gradient(135deg,#34c759,#30d158); box-shadow:0 4px 14px rgba(52,199,89,0.4); }

    #__mc_note_btn {
      position:fixed; z-index:2147483647;
      background:linear-gradient(135deg,#5856d6,#af52de);
      color:#fff; border:none; border-radius:0 0 14px 14px;
      padding:10px 28px; font-size:13px; font-weight:600;
      cursor:pointer; white-space:nowrap; letter-spacing:0.5px;
      box-shadow:0 4px 14px rgba(88,86,214,0.4);
      opacity:0; pointer-events:none;
      transition:opacity 0.1s, transform 0.12s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      transform:translateX(-50%);
    }
    #__mc_note_btn.mc_on { opacity:1; pointer-events:auto; }
    #__mc_note_btn:hover { transform:translateX(-50%) scale(1.04); box-shadow:0 5px 18px rgba(88,86,214,0.55); }
    #__mc_note_btn:active { transform:translateX(-50%) scale(0.96); }
    #__mc_note_btn.mc_done { background:linear-gradient(135deg,#34c759,#30d158); box-shadow:0 4px 14px rgba(52,199,89,0.4); }

    #__mc_select_modal {
      position:fixed; z-index:2147483648;
      background:#fff; border-radius:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.2);
      padding:16px; min-width:240px;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
      opacity:0; pointer-events:none;
      transition:opacity 0.15s;
    }
    #__mc_select_modal.mc_on { opacity:1; pointer-events:auto; }

    .mc_toast {
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:rgba(0,0,0,0.8); color:#fff; padding:10px 24px; border-radius:20px;
      font-size:14px; z-index:2147483647; pointer-events:none;
      opacity:0; transition:opacity 0.2s;
      font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
    }
    .mc_toast.mc_show { opacity:1; }
  `
  document.head.appendChild(style)
}

// ====== Toast ======
let toastEl: HTMLDivElement | null = null

export function showToast(msg: string) {
  if (!toastEl) {
    toastEl = document.createElement("div")
    toastEl.className = "mc_toast"
    document.body.appendChild(toastEl)
  }
  toastEl.textContent = msg
  toastEl.classList.add("mc_show")
  clearTimeout((toastEl as any)._t)
  ;(toastEl as any)._t = setTimeout(() => toastEl?.classList.remove("mc_show"), 1800)
}

// ====== 媒体检测 ======
export function detectMediaAtPoint(x: number, y: number): {
  url: string
  type: string
  el: Element
} | null {
  const elements = document.elementsFromPoint(x, y)
  if (!elements?.length) return null

  for (const el of elements) {
    if (el.id.startsWith("__mc_")) continue

    const tag = el.tagName.toLowerCase()

    if (tag === "img" && (el as HTMLImageElement).src && !(el as HTMLImageElement).src.startsWith("data:")) {
      return { url: (el as HTMLImageElement).src, type: "image", el }
    }

    if (tag === "video") {
      const v = el as HTMLVideoElement
      const src = v.src || v.querySelector("source")?.src
      if (src) return { url: src, type: "video", el }
    }

    if (tag === "div" || tag === "span" || tag === "a" || tag === "li") {
      const bg = getComputedStyle(el).backgroundImage
      if (bg && bg !== "none" && bg.startsWith("url(")) {
        const url = bg.slice(5, -2).replace(/"/g, "")
        if (url && !url.startsWith("data:")) return { url, type: "image", el }
      }
    }
  }
  return null
}

// ====== 标题提取 ======
export function extractTitle(): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:title"]')
  if (og?.content) return og.content.slice(0, 200)
  const titleEl =
    document.querySelector("#detail-title") ||
    document.querySelector('[class*="title"]') ||
    document.querySelector("h1")
  return ((titleEl?.textContent || document.title) || "").slice(0, 200)
}

// ====== 悬停 UI 管理器 ======
export interface HoverUIConfig {
  onCollect: (media: { url: string; type: string; el: Element }) => void
  onNoteCollect?: () => void
  getCollectButtonText?: () => string
}

export class HoverUIManager {
  private highlightEl: HTMLDivElement
  private collectBtn: HTMLButtonElement
  private noteBtn: HTMLButtonElement | null = null
  private config: HoverUIConfig

  public lastMedia: { url: string; type: string; el: Element } | null = null
  public collected = false
  public btnHovered = false
  public noteBtnHovered = false

  private lastMoveTime = 0

  constructor(config: HoverUIConfig) {
    this.config = config

    // highlight
    this.highlightEl = document.createElement("div")
    this.highlightEl.id = "__mc_highlight"
    document.body.appendChild(this.highlightEl)

    // collect button
    this.collectBtn = document.createElement("button")
    this.collectBtn.id = "__mc_btn"
    this.collectBtn.textContent = config.getCollectButtonText?.() ?? "📥 采集"
    this.collectBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      e.preventDefault()
      if (this.lastMedia) config.onCollect(this.lastMedia)
    })
    this.collectBtn.addEventListener("mouseenter", () => {
      this.btnHovered = true
    })
    this.collectBtn.addEventListener("mouseleave", () => {
      this.btnHovered = false
      if (!this.collected) this.hideAll()
    })
    document.body.appendChild(this.collectBtn)

    // mouse move
    document.addEventListener(
      "mousemove",
      (e) => {
        if (this.collected) return
        const now = Date.now()
        if (now - this.lastMoveTime < 80) return
        this.lastMoveTime = now

        const media = detectMediaAtPoint(e.clientX, e.clientY)
        if (media) {
          if (!this.lastMedia || this.lastMedia.el !== media.el) this.showAll(media)
        } else {
          this.hideAll()
        }
      },
      { passive: true }
    )
  }

  showAll(media: { url: string; type: string; el: Element }) {
    const rect = media.el.getBoundingClientRect()
    this.highlightEl.style.left = rect.left + "px"
    this.highlightEl.style.top = rect.top + "px"
    this.highlightEl.style.width = rect.width + "px"
    this.highlightEl.style.height = rect.height + "px"
    this.highlightEl.classList.add("mc_on")

    this.positionButton(media.el)

    if (!this.collected) {
      this.collectBtn.classList.remove("mc_done")
      this.collectBtn.textContent = this.config.getCollectButtonText?.() ?? "📥 采集"
    }
    this.collectBtn.classList.add("mc_on")
    this.lastMedia = media
  }

  hideAll() {
    this.highlightEl.classList.remove("mc_on")
    if (!this.btnHovered && !this.collected) {
      this.collectBtn.classList.remove("mc_on")
      this.lastMedia = null
    }
  }

  showCollected() {
    this.collected = true
    this.collectBtn.textContent = "..."
    this.collectBtn.style.pointerEvents = "none"
  }

  resetCollectState() {
    this.collectBtn.classList.remove("mc_done")
    this.collectBtn.classList.remove("mc_on")
    this.highlightEl.classList.remove("mc_on")
    this.collectBtn.textContent = this.config.getCollectButtonText?.() ?? "📥 采集"
    this.collectBtn.style.pointerEvents = "auto"
    this.collected = false
    this.lastMedia = null
  }

  markDone() {
    this.collectBtn.classList.add("mc_done")
    this.collectBtn.textContent = "✅ 已采集"

    setTimeout(() => this.resetCollectState(), 1500)
  }

  private positionButton(el: Element) {
    const rect = el.getBoundingClientRect()
    let x = rect.left + rect.width / 2
    let y = rect.bottom + 4
    if (y + 40 > window.innerHeight) y = rect.top - 44
    this.collectBtn.style.left = x + "px"
    this.collectBtn.style.top = y + "px"
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit contents/base.ts`
Expected: No errors from contents/base.ts itself

- [ ] **Step 3: 提交**

```bash
git add contents/base.ts
git commit -m "feat: add shared content script base module"
```

---

### Task 6: 创建小红书 content script

**Files:**
- Create: `contents/xiaohongshu.ts`
- Delete: `content.ts` (after verifying douyin.ts also works)

- [ ] **Step 1: 创建 contents/xiaohongshu.ts**

```typescript
// contents/xiaohongshu.ts — 小红书：单图采集 + 多图笔记提取
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, HoverUIManager, showToast, extractTitle } from "./base"

export const config: PlasmoCSConfig = {
  matches: ["https://www.xiaohongshu.com/*"],
  run_at: "document_idle",
}

// ====== 小红书笔记多图提取 ======
interface XHSImage {
  url: string
  width?: number
  height?: number
}

function extractXHSNoteImages(): XHSImage[] {
  const state = (window as any).__INITIAL_STATE__
  if (!state?.note) return []

  const noteId =
    location.pathname.split("/").pop() ||
    Object.keys(state.note.noteDetailMap || {})[0] ||
    ""

  const note =
    state.note.noteDetailMap?.[noteId]?.note ||
    state.note.noteDetailMap?.[Object.keys(state.note.noteDetailMap)[0]]?.note

  if (!note?.imageList) return []

  return note.imageList.map((img: any) => ({
    url: String(img.url || "").replace(/\?imageView2.*$/, ""),
    width: img.width,
    height: img.height,
  }))
}

function isNoteDetailPage(): boolean {
  const path = location.pathname
  return path.includes("/explore/") || path.includes("/discovery/item/")
}

function getNoteId(): string {
  return location.pathname.split("/").pop() || ""
}

// ====== 主逻辑 ======
function main() {
  console.log("🔍 素材采集助手已激活 [xiaohongshu]")

  injectStyles()

  const ui = new HoverUIManager({
    onCollect: (media) => {
      if (isNoteDetailPage()) {
        const images = extractXHSNoteImages()
        if (images.length > 1) {
          // 多图笔记：弹出选择
          showSelectModal(media, images)
          return
        }
      }

      // 单图采集
      doCollect(media.url, media.type, undefined, undefined, undefined, undefined)
    },
  })

  function doCollect(
    url: string,
    type: string,
    noteId?: string,
    groupIndex?: number,
    width?: number,
    height?: number
  ) {
    ui.showCollected()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_MEDIA",
        payload: {
          url,
          type,
          platform: "xiaohongshu",
          title: extractTitle(),
          sourceUrl: location.href,
          noteId,
          groupIndex,
          width,
          height,
        },
      },
      (resp) => {
        if (resp?.success) {
          ui.markDone()
          showToast("✅ 素材已采集")
        } else {
          ui.resetCollectState()
          showToast(resp?.error || "采集失败")
        }
      }
    )
  }

  function doCollectNoteImages(images: XHSImage[]) {
    const noteId = getNoteId()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_NOTE_IMAGES",
        payload: {
          noteId,
          images: images.map((img, i) => ({
            url: img.url,
            width: img.width,
            height: img.height,
            groupIndex: i,
          })),
          title: extractTitle(),
          sourceUrl: location.href,
        },
      },
      (resp) => {
        if (resp?.success) {
          showToast(`✅ 已采集笔记全部 ${images.length} 张图片`)
        } else {
          showToast(resp?.error || "笔记采集失败")
        }
        removeSelectModal()
      }
    )
  }

  // ====== 选择弹窗 ======
  let selectModal: HTMLDivElement | null = null

  function showSelectModal(
    currentMedia: { url: string; type: string; el: Element },
    images: XHSImage[]
  ) {
    removeSelectModal()

    selectModal = document.createElement("div")
    selectModal.id = "__mc_select_modal"
    selectModal.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#333;">📸 笔记包含 ${images.length} 张图片</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;overflow-x:auto;padding-bottom:4px;">
        ${images.slice(0, 5).map((img, i) => `
          <div style="flex-shrink:0;width:56px;height:56px;border-radius:6px;overflow:hidden;border:2px solid ${img.url === currentMedia.url ? '#ff2d55' : '#eee'};">
            <img src="${img.url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
          </div>
        `).join("")}
        ${images.length > 5 ? `<div style="flex-shrink:0;width:56px;height:56px;border-radius:6px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#999;">+${images.length - 5}</div>` : ""}
      </div>
      <button id="__mc_single_btn" style="width:100%;padding:8px;margin-bottom:6px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-family:inherit;">🖼️ 仅采集当前图片</button>
      <button id="__mc_all_btn" style="width:100%;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#ff2d55,#ff6b81);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">📚 采集全部 ${images.length} 张图片</button>
    `

    const rect = currentMedia.el.getBoundingClientRect()
    let top = rect.bottom + 8
    let left = rect.left + rect.width / 2 - 120
    if (left < 8) left = 8
    if (top + 200 > window.innerHeight) top = rect.top - 210

    selectModal.style.left = left + "px"
    selectModal.style.top = top + "px"
    document.body.appendChild(selectModal)

    // 延迟显示触发动画
    requestAnimationFrame(() => selectModal!.classList.add("mc_on"))

    // 事件
    selectModal.querySelector("#__mc_single_btn")!.addEventListener("click", (e) => {
      e.stopPropagation()
      const currentIdx = images.findIndex((img) => img.url === currentMedia.url)
      doCollect(currentMedia.url, currentMedia.type, getNoteId(), Math.max(0, currentIdx), images[currentIdx]?.width, images[currentIdx]?.height)
      removeSelectModal()
    })

    selectModal.querySelector("#__mc_all_btn")!.addEventListener("click", (e) => {
      e.stopPropagation()
      doCollectNoteImages(images)
    })

    // 点击外部关闭
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectModal && !selectModal.contains(e.target as Node)) {
        removeSelectModal()
        document.removeEventListener("click", handleOutsideClick)
      }
    }
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 100)
  }

  function removeSelectModal() {
    if (selectModal) {
      selectModal.classList.remove("mc_on")
      setTimeout(() => {
        selectModal?.remove()
        selectModal = null
      }, 150)
    }
  }

  // ====== 响应后台消息 ======
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_LAST_MEDIA") {
      const media = ui.lastMedia
        ? {
            url: ui.lastMedia.url,
            type: ui.lastMedia.type,
            platform: "xiaohongshu",
            title: extractTitle(),
            sourceUrl: location.href,
          }
        : null
      sendResponse({ success: true, media })
    }
    return true
  })

  console.log("✅ 小红书就绪 — 悬停图片采集 / 笔记详情页全部采集")
}

main()
```

- [ ] **Step 2: 提交**

```bash
git add contents/xiaohongshu.ts
git commit -m "feat: add xiaohongshu content script with multi-image extraction"
```

---

### Task 7: 创建抖音 content script 并删除旧 content.ts

**Files:**
- Create: `contents/douyin.ts`
- Delete: `content.ts`

- [ ] **Step 1: 创建 contents/douyin.ts**

```typescript
// contents/douyin.ts — 抖音：视频采集（v2.0 保持 v1.0 逻辑）
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, HoverUIManager, showToast, extractTitle } from "./base"

export const config: PlasmoCSConfig = {
  matches: ["https://www.douyin.com/*"],
  run_at: "document_idle",
}

function main() {
  console.log("🔍 素材采集助手已激活 [douyin]")

  injectStyles()

  const ui = new HoverUIManager({
    onCollect: (media) => {
      doCollect(media.url, media.type)
    },
  })

  function doCollect(url: string, type: string) {
    ui.showCollected()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_MEDIA",
        payload: {
          url,
          type,
          platform: "douyin",
          title: extractTitle(),
          sourceUrl: location.href,
        },
      },
      (resp) => {
        if (resp?.success) {
          ui.markDone()
          showToast("✅ 素材已采集")
        } else {
          ui.resetCollectState()
          showToast(resp?.error || "采集失败")
        }
      }
    )
  }

  // ====== 响应后台消息 ======
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_LAST_MEDIA") {
      const media = ui.lastMedia
        ? {
            url: ui.lastMedia.url,
            type: ui.lastMedia.type,
            platform: "douyin",
            title: extractTitle(),
            sourceUrl: location.href,
          }
        : null
      sendResponse({ success: true, media })
    }
    return true
  })

  console.log("✅ 抖音就绪 — 悬停视频采集")
}

main()
```

- [ ] **Step 2: 删除旧的 content.ts**

```bash
rm content.ts
```

- [ ] **Step 3: 验证 Plasmo 构建**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx plasmo build 2>&1 | tail -20`
Expected: Build succeeds, both content scripts registered in manifest.json

- [ ] **Step 4: 提交**

```bash
git add contents/douyin.ts
git rm content.ts
git commit -m "refactor: split content scripts by platform, remove old content.ts"
```

---

### Task 8: 提取 popup UI 组件 — MediaCard

**Files:**
- Create: `components/MediaCard.tsx`
- Modify: `popup.tsx` (import MediaCard)

- [ ] **Step 1: 创建 components/MediaCard.tsx**

```typescript
// components/MediaCard.tsx — 素材卡片组件
import React from "react"
import type { MediaItem } from "../types"
import { PLATFORM_LABELS } from "../types"

interface MediaCardProps {
  item: MediaItem
  selected: boolean
  onToggle: () => void
  onDownload: () => void
  onRemove: () => void
}

export function MediaCard({ item, selected, onToggle, onDownload, onRemove }: MediaCardProps) {
  const platformLabel = PLATFORM_LABELS[item.platform] || item.platform

  return (
    <li
      style={{
        ...styles.card,
        borderColor: selected ? "#ff2d55" : "#eee",
        background: selected ? "#fff5f7" : "#fff",
      }}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        style={{ accentColor: "#ff2d55", flexShrink: 0, width: 18, height: 18, cursor: "pointer" }}
      />
      <img
        src={item.url}
        style={{
          ...styles.thumb,
          objectFit: item.type === "video" ? "contain" : "cover",
          background: item.type === "video" ? "#000" : "#f0f0f0",
        }}
        onError={(e) => {
          ;(e.target as HTMLImageElement).src =
            "data:image/svg+xml," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" fill="#ddd"><rect width="56" height="56"/><text x="50%" y="55%" text-anchor="middle" font-size="22">${
                item.type === "video" ? "🎬" : "🖼️"
              }</text></svg>`
            )
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.title}>
          {item.title || item.url.split("/").pop() || "未命名素材"}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              background: item.platform === "xiaohongshu" ? "#ff2442" : "#000",
              color: "#fff",
            }}>
            {platformLabel}
          </span>
          <span style={{ fontSize: 11, color: "#666" }}>
            {item.type === "video" ? "🎬 视频" : "🖼️ 图片"}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        <button onClick={onDownload} style={styles.dlBtn}>
          下载
        </button>
        <button onClick={onRemove} style={styles.rmBtn} title="移除">
          ×
        </button>
      </div>
    </li>
  )
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    display: "flex",
    gap: 10,
    padding: 10,
    marginBottom: 6,
    borderRadius: 8,
    border: "1px solid #eee",
    alignItems: "center",
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    flexShrink: 0,
  },
  title: {
    fontSize: 12,
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-all",
  },
  dlBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
  rmBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    padding: "4px 8px",
    fontSize: 12,
    whiteSpace: "nowrap",
  },
}
```

- [ ] **Step 2: 提交**

```bash
git add components/MediaCard.tsx
git commit -m "feat: extract MediaCard component from popup"
```

---

### Task 9: 提取 popup UI 组件 — BatchBar 和 PlatformFilter

**Files:**
- Create: `components/BatchBar.tsx`
- Create: `components/PlatformFilter.tsx`

- [ ] **Step 1: 创建 components/BatchBar.tsx**

```typescript
// components/BatchBar.tsx — 批量操作栏
import React from "react"

interface BatchBarProps {
  selectAll: boolean
  selectedCount: number
  totalCount: number
  batchDownloading: boolean
  onToggleAll: () => void
  onBatchDownload: () => void
}

export function BatchBar({
  selectAll,
  selectedCount,
  totalCount,
  batchDownloading,
  onToggleAll,
  onBatchDownload,
}: BatchBarProps) {
  return (
    <div style={styles.batchBar}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          cursor: "pointer",
        }}>
        <input
          type="checkbox"
          checked={selectAll && totalCount > 0}
          onChange={onToggleAll}
          style={{ accentColor: "#ff2d55" }}
        />
        全选
      </label>
      <span style={{ fontSize: 12, color: "#999", flex: 1 }}>
        已选 {selectedCount} / {totalCount}
      </span>
      <button
        onClick={onBatchDownload}
        disabled={selectedCount === 0 || batchDownloading}
        style={{
          ...styles.batchBtn,
          opacity: selectedCount === 0 ? 0.4 : 1,
        }}>
        {batchDownloading ? "下载中..." : "⬇️ 批量下载"}
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  batchBar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
  },
  batchBtn: {
    background: "linear-gradient(135deg, #ff2d55, #ff6b81)",
    color: "#fff",
    border: "none",
    borderRadius: 14,
    padding: "6px 16px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
}
```

- [ ] **Step 2: 创建 components/PlatformFilter.tsx**

```typescript
// components/PlatformFilter.tsx — 平台筛选组件
import React from "react"
import { PLATFORM_LABELS } from "../types"

interface PlatformFilterProps {
  activePlatform: string | null
  platformCounts: Record<string, number>
  onChange: (platform: string | null) => void
}

export function PlatformFilter({ activePlatform, platformCounts, onChange }: PlatformFilterProps) {
  const allCount = Object.values(platformCounts).reduce((a, b) => a + b, 0)

  return (
    <div style={styles.filterRow}>
      <button
        onClick={() => onChange(null)}
        style={{
          ...styles.filterBtn,
          background: activePlatform === null ? "#ff2d55" : "#f0f0f0",
          color: activePlatform === null ? "#fff" : "#666",
          fontWeight: activePlatform === null ? 600 : 400,
        }}>
        全部 ({allCount})
      </button>
      {Object.entries(platformCounts).map(([platform, count]) => (
        <button
          key={platform}
          onClick={() => onChange(platform)}
          style={{
            ...styles.filterBtn,
            background: activePlatform === platform ? "#ff2d55" : "#f0f0f0",
            color: activePlatform === platform ? "#fff" : "#666",
            fontWeight: activePlatform === platform ? 600 : 400,
          }}>
          {PLATFORM_LABELS[platform] || platform} ({count})
        </button>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  filterRow: {
    display: "flex",
    gap: 6,
    padding: "6px 14px",
    background: "#fff",
    borderBottom: "1px solid #eee",
    overflowX: "auto",
  },
  filterBtn: {
    border: "none",
    borderRadius: 12,
    padding: "4px 12px",
    fontSize: 11,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontFamily: "inherit",
    transition: "background 0.15s",
  },
}
```

- [ ] **Step 3: 提交**

```bash
git add components/BatchBar.tsx components/PlatformFilter.tsx
git commit -m "feat: extract BatchBar and PlatformFilter components"
```

---

### Task 10: 创建笔记分组组件 NoteGroup

**Files:**
- Create: `components/NoteGroup.tsx`

- [ ] **Step 1: 创建 components/NoteGroup.tsx**

```typescript
// components/NoteGroup.tsx — 笔记分组折叠组件
import React, { useState } from "react"
import type { MediaItem } from "../types"
import { MediaCard } from "./MediaCard"

interface NoteGroupProps {
  noteId: string
  title: string
  items: MediaItem[]
  onToggleItem: (index: number, globalIndex: number) => void
  onDownloadItem: (item: MediaItem) => void
  onRemoveItem: (id: string) => void
  selectedSet: Set<string>
  getGlobalIndex: (item: MediaItem) => number
}

export function NoteGroup({
  noteId,
  title,
  items,
  onToggleItem,
  onDownloadItem,
  onRemoveItem,
  selectedSet,
  getGlobalIndex,
}: NoteGroupProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div style={styles.group}>
      <div style={styles.groupHeader} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 18, transition: "transform 0.2s", transform: collapsed ? "rotate(-90deg)" : "none" }}>
          ▾
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#333", flex: 1 }}>
          📝 {title || "未命名笔记"}
        </span>
        <span style={styles.groupBadge}>{items.length} 张</span>
      </div>
      {!collapsed && (
        <div style={styles.groupBody}>
          {items
            .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0))
            .map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={selectedSet.has(item.id)}
                onToggle={() => onToggleItem(items.indexOf(item), getGlobalIndex(item))}
                onDownload={() => onDownloadItem(item)}
                onRemove={() => onRemoveItem(item.id)}
              />
            ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  group: {
    marginBottom: 8,
    borderRadius: 10,
    border: "1px solid #eee",
    overflow: "hidden",
    background: "#fff",
  },
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 12px",
    cursor: "pointer",
    userSelect: "none",
    background: "#fafafa",
  },
  groupBadge: {
    fontSize: 11,
    color: "#999",
    background: "#f0f0f0",
    padding: "1px 8px",
    borderRadius: 8,
  },
  groupBody: {
    padding: "4px 8px",
  },
}
```

- [ ] **Step 2: 提交**

```bash
git add components/NoteGroup.tsx
git commit -m "feat: add NoteGroup collapsible component for multi-image notes"
```

---

### Task 11: 重构 popup.tsx — 整合组件

**Files:**
- Modify: `popup.tsx` (全面整合新组件)

- [ ] **Step 1: 重写 popup.tsx**

```typescript
// popup.tsx — 素材采集助手弹窗主组件
import { useState, useEffect, useCallback, useMemo } from "react"
import type { MediaItem } from "./types"
import { PLATFORM_LABELS } from "./types"
import { BatchBar } from "./components/BatchBar"
import { PlatformFilter } from "./components/PlatformFilter"
import { MediaCard } from "./components/MediaCard"
import { NoteGroup } from "./components/NoteGroup"

function Popup() {
  const [items, setItems] = useState<MediaItem[]>([])
  const [selectAll, setSelectAll] = useState(false)
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [activePlatform, setActivePlatform] = useState<string | null>(null)

  const loadItems = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_ITEMS" }, (resp) => {
      if (resp?.items) setItems(resp.items)
    })
  }, [])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // 平台筛选
  const filteredItems = useMemo(() => {
    if (!activePlatform) return items
    return items.filter((i) => i.platform === activePlatform)
  }, [items, activePlatform])

  // 平台计数
  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((i) => {
      counts[i.platform] = (counts[i.platform] || 0) + 1
    })
    return counts
  }, [items])

  // 笔记分组
  const { groupedItems, ungroupedItems } = useMemo(() => {
    const groups = new Map<string, MediaItem[]>()
    const ungrouped: MediaItem[] = []

    filteredItems.forEach((item) => {
      if (item.noteId) {
        const existing = groups.get(item.noteId)
        if (existing) {
          existing.push(item)
        } else {
          groups.set(item.noteId, [item])
        }
      } else {
        ungrouped.push(item)
      }
    })

    return { groupedItems: groups, ungroupedItems: ungrouped }
  }, [filteredItems])

  const selectedSet = useMemo(() => {
    return new Set(filteredItems.filter((i) => i._selected).map((i) => i.id))
  }, [filteredItems])

  const selectedCount = selectedSet.size

  const toggleItem = (globalIndex: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === globalIndex ? { ...item, _selected: !item._selected } : item))
    )
  }

  const toggleAll = () => {
    const newVal = !selectAll
    setSelectAll(newVal)
    setItems((prev) =>
      prev.map((item) => {
        if (!activePlatform || item.platform === activePlatform) {
          return { ...item, _selected: newVal }
        }
        return item
      })
    )
  }

  const downloadSingle = (item: MediaItem) => {
    const ext = item.type === "video" ? "mp4" : "jpg"
    const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
    const filename =
      item.groupIndex !== undefined
        ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
        : `${baseName}.${ext}`
    chrome.runtime.sendMessage({ type: "DOWNLOAD_ITEM", payload: { url: item.url, filename } })
  }

  const batchDownload = () => {
    const selected = filteredItems.filter((i) => i._selected)
    if (selected.length === 0) return
    setBatchDownloading(true)
    chrome.runtime.sendMessage(
      {
        type: "BATCH_DOWNLOAD",
        payload: selected.map((item) => {
          const ext = item.type === "video" ? "mp4" : "jpg"
          const baseName = (item.title || "素材").replace(/[/\\?%*:|"<>]/g, "-").slice(0, 50)
          return {
            url: item.url,
            filename:
              item.groupIndex !== undefined
                ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
                : `${baseName}.${ext}`,
          }
        }),
      },
      () => {
        setBatchDownloading(false)
        setItems((prev) => prev.map((i) => ({ ...i, _selected: false })))
        setSelectAll(false)
      }
    )
  }

  const removeItem = (id: string) => {
    const filtered = items.filter((i) => i.id !== id)
    chrome.storage.local.set({ collected_media: filtered }, () => setItems(filtered))
  }

  const clearAll = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_ITEMS" }, () => setItems([]))
  }

  // 获取 item 在原始 items 数组中的索引
  const getGlobalIndex = useCallback(
    (item: MediaItem) => items.findIndex((i) => i.id === item.id),
    [items]
  )

  if (items.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
        <p style={{ color: "#999" }}>还没有采集素材</p>
        <p style={{ fontSize: 13, color: "#bbb", marginTop: 8, lineHeight: 1.6 }}>
          打开 <b>小红书</b> 或 <b>抖音</b>，
          <br />
          鼠标悬停图片，点击采集按钮
        </p>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={{ fontWeight: 600, fontSize: 16 }}>🎬 素材采集助手</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={styles.badge}>{items.length}</span>
          <button onClick={clearAll} style={styles.iconBtn} title="清空">
            🗑️
          </button>
        </div>
      </div>

      {/* Platform Filter */}
      <PlatformFilter
        activePlatform={activePlatform}
        platformCounts={platformCounts}
        onChange={setActivePlatform}
      />

      {/* Batch Bar */}
      <BatchBar
        selectAll={selectAll}
        selectedCount={selectedCount}
        totalCount={filteredItems.length}
        batchDownloading={batchDownloading}
        onToggleAll={toggleAll}
        onBatchDownload={batchDownload}
      />

      {/* List with Note Groups */}
      <ul style={styles.list}>
        {/* 笔记分组 */}
        {Array.from(groupedItems.entries()).map(([noteId, noteItems]) => (
          <NoteGroup
            key={noteId}
            noteId={noteId}
            title={noteItems[0]?.title || "未命名笔记"}
            items={noteItems}
            onToggleItem={toggleItem}
            onDownloadItem={downloadSingle}
            onRemoveItem={removeItem}
            selectedSet={selectedSet}
            getGlobalIndex={getGlobalIndex}
          />
        ))}

        {/* 未分组 */}
        {ungroupedItems.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            selected={selectedSet.has(item.id)}
            onToggle={() => toggleItem(getGlobalIndex(item))}
            onDownload={() => downloadSingle(item)}
            onRemove={() => removeItem(item.id)}
          />
        ))}
      </ul>

      <div style={styles.footer}>
        <small style={{ color: "#bbb", fontSize: 11 }}>支持平台：小红书 · 抖音</small>
      </div>
    </div>
  )
}

// ====== inline styles ======
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: 380,
    minHeight: 420,
    maxHeight: 600,
    display: "flex",
    flexDirection: "column",
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
    background: "#fafafa",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    background: "linear-gradient(135deg, #ff2d55, #ff6b81)",
    color: "#fff",
    flexShrink: 0,
  },
  badge: {
    background: "rgba(255,255,255,0.3)",
    padding: "2px 8px",
    borderRadius: 10,
    fontSize: 12,
    fontWeight: 600,
  },
  iconBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
    borderRadius: 4,
  },
  list: {
    flex: 1,
    listStyle: "none",
    overflowY: "auto",
    padding: 8,
    margin: 0,
  },
  empty: {
    width: 380,
    height: 420,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  },
  footer: {
    textAlign: "center",
    padding: 8,
    borderTop: "1px solid #eee",
    background: "#fff",
    flexShrink: 0,
  },
}

export default Popup
```

- [ ] **Step 2: 验证 Plasmo 构建**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx plasmo build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 3: 提交**

```bash
git add popup.tsx
git commit -m "refactor: integrate components into popup with platform filter and note grouping"
```

---

### Task 12: 端到端验证与收尾

- [ ] **Step 1: 构建验证**

Run: `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx plasmo build`
Expected: Build succeeds, check `build/chrome-mv3-prod/manifest.json` contains both content scripts and background script.

- [ ] **Step 2: 检查 manifest.json**

Run: `cat build/chrome-mv3-prod/manifest.json | python3 -m json.tool`
Expected: manifest 包含:
- `content_scripts` 中有两个条目，分别匹配 xiaohongshu 和 douyin
- `background.service_worker` 指向 background/index.ts
- `host_permissions` 包含两个平台
- `permissions` 包含 storage, downloads, contextMenus, notifications

- [ ] **Step 3: 检查构建产物文件**

Run: `ls -la build/chrome-mv3-prod/`
Expected: 包含 content scripts 和 popup 的 JS 文件

- [ ] **Step 4: 最终提交**

```bash
git add -A
git status
git commit -m "chore: final v2.0 architecture refactor complete"
```

---

## 任务依赖关系

```
Task 1 (types) ──┬── Task 2 (storage) ──┬── Task 4 (background/index)
                 │                      │
                 │                      └── Task 3 (download) ──┘
                 │
                 ├── Task 5 (base.ts) ──┬── Task 6 (xiaohongshu.ts)
                 │                      │
                 │                      └── Task 7 (douyin.ts + delete content.ts)
                 │
                 └── Task 8 (MediaCard) ──┬── Task 10 (NoteGroup)
                                          │
                 Task 9 (BatchBar +       │
                 PlatformFilter)          │
                                          │
                 └── Task 11 (popup.tsx) ─┘

Task 12 (验证) ← 所有 tasks 完成后
```

---

## Self-Review

**1. Spec coverage:**
- ✅ Phase 1 架构重构: Task 1-11 完整覆盖
- ✅ Phase 2 小红书多图: Task 6 实现 __INITIAL_STATE__ 解析 + 选择弹窗
- ✅ Phase 4 弹窗增强: Task 8-11 实现平台筛选、笔记分组、批量下载增强
- ⚠️ Phase 3 抖音无水印: DESIGN.md 中标记为 TODO，无详细设计，本次不实施

**2. Placeholder scan:**
- ✅ 无 TBD/TODO/implement later
- ✅ 所有步骤包含实际代码
- ✅ 所有路径为精确路径

**3. Type consistency:**
- ✅ MediaItem 在所有组件中一致使用
- ✅ MessageType 与 background 消息路由一致
- ✅ PLATFORM_LABELS 在 types.ts 定义，各组件引用

