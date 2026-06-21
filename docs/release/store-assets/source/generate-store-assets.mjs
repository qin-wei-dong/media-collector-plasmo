import fs from "node:fs/promises"
import http from "node:http"
import { createRequire } from "node:module"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const puppeteer = require("puppeteer-core")

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")
const buildDir = resolve(root, "build/chrome-mv3-prod")
const libraryHtml = resolve(buildDir, "tabs/library.html")
const outDir = resolve(root, "docs/release/store-assets")
const screenshotsDir = resolve(outDir, "screenshots")
const promosDir = resolve(outDir, "promos")
const sourceDir = resolve(outDir, "source")
const harnessHtml = resolve(sourceDir, "store-assets-harness.html")
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

await fs.mkdir(screenshotsDir, { recursive: true })
await fs.mkdir(promosDir, { recursive: true })
await fs.mkdir(sourceDir, { recursive: true })

const sample = makeSampleData()
const mockScript = `
<script>
document.documentElement.lang = "zh-CN"
window.__MC_STORE_SAMPLE__ = ${JSON.stringify(sample)}
;(function () {
  const storageData = { theme_mode: "dark" }
  function clone(value) {
    return JSON.parse(JSON.stringify(value))
  }
  const handlers = {
    GET_ITEMS: () => ({ success: true, items: clone(window.__MC_STORE_SAMPLE__.items) }),
    GET_COLLECTIONS: () => ({ success: true, collections: clone(window.__MC_STORE_SAMPLE__.collections) }),
    GET_EXPORT_HISTORY: () => ({ success: true, history: clone(window.__MC_STORE_SAMPLE__.history) }),
    BATCH_DOWNLOAD: () => ({ success: true, count: 6, folder: "灵感参考", folders: ["灵感参考"], exportedIds: [], errors: [] }),
    REMOVE_ITEMS: () => ({ success: true }),
    RESTORE_ITEMS: () => ({ success: true, restored: 1 }),
    CREATE_COLLECTION: () => ({ success: true, collection: window.__MC_STORE_SAMPLE__.collections[0] }),
    RENAME_COLLECTION: () => ({ success: true }),
    DELETE_COLLECTION: () => ({ success: true }),
    ASSIGN_COLLECTION: () => ({ success: true }),
    UNASSIGN_COLLECTION: () => ({ success: true }),
    UPDATE_COLLECTION_COLOR: () => ({ success: true }),
    PIN_COLLECTION: () => ({ success: true }),
    MOVE_COLLECTION_ITEMS: () => ({ success: true, movedCount: 6 }),
    CLEAR_EXPORT_HISTORY: () => ({ success: true }),
    RETRY_EXPORT_FAILED: () => ({ success: true, count: 2 }),
    SHOW_DOWNLOADS_FOLDER: () => ({ success: true })
  }
  window.chrome = {
    runtime: {
      id: "store-assets-harness",
      lastError: null,
      sendMessage: (msg, cb) => {
        const reply = handlers[msg?.type] ? handlers[msg.type](msg.payload) : { success: false, error: "mock-no-handler" }
        if (typeof cb === "function") setTimeout(() => cb(reply), 0)
      },
      getURL: (path) => path,
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: (keys, cb) => {
          if (typeof keys === "function") {
            keys(storageData)
            return
          }
          if (keys == null) {
            cb(storageData)
            return
          }
          if (Array.isArray(keys)) {
            cb(Object.fromEntries(keys.map((key) => [key, storageData[key]])))
            return
          }
          if (typeof keys === "object") {
            cb(Object.fromEntries(Object.keys(keys).map((key) => [key, storageData[key] ?? keys[key]])))
            return
          }
          cb({ [keys]: storageData[keys] })
        },
        set: (obj, cb) => {
          Object.assign(storageData, obj)
          if (typeof cb === "function") setTimeout(cb, 0)
        },
        remove: (keys, cb) => {
          const list = Array.isArray(keys) ? keys : [keys]
          list.forEach((key) => delete storageData[key])
          if (typeof cb === "function") setTimeout(cb, 0)
        }
      }
    },
    tabs: {
      create: () => {},
      query: (_query, cb) => cb([]),
      update: () => {}
    },
    downloads: {
      showDefaultFolder: () => {}
    },
    notifications: {
      create: () => {}
    }
  }
})()
</script>
`

const rawHtml = await fs.readFile(libraryHtml, "utf8")
const harness = rawHtml
  .replace("<html>", '<html lang="zh-CN">')
  .replace("<head>", "<head><base href=\"/build/chrome-mv3-prod/\">")
  .replaceAll('src="/tabs/', 'src="/build/chrome-mv3-prod/tabs/')
  .replace("</head>", `${mockScript}</head>`)
await fs.writeFile(harnessHtml, harness)

const { server, port } = await startServer(root)
const browser = await puppeteer.launch({
  headless: "new",
  executablePath: chromePath,
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  args: ["--no-first-run", "--no-default-browser-check", "--disable-web-security"],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/docs/release/store-assets/source/store-assets-harness.html`, { waitUntil: "networkidle0" })
  await page.waitForSelector(".mc-library-cell", { timeout: 10000 })
  await settle(page)
  await page.screenshot({ path: resolve(screenshotsDir, "01-library-overview-1280x800.png") })

  await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll(".mc-library-cell"))
    ;[0, 1, 2, 4, 6, 8].forEach((index) => cells[index]?.click())
  })
  await settle(page)
  await page.screenshot({ path: resolve(screenshotsDir, "02-batch-selection-export-1280x800.png") })

  await page.evaluate(() => {
    const previewButtons = Array.from(document.querySelectorAll('button[aria-label="预览该素材"]'))
    ;(previewButtons[1] || previewButtons[0])?.click()
  })
  await settle(page)
  await page.screenshot({ path: resolve(screenshotsDir, "03-preview-modal-1280x800.png") })

  await page.keyboard.press("Escape")
  await settle(page)
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find((el) => el.textContent?.includes("导出历史"))
    button?.click()
  })
  await settle(page)
  await page.screenshot({ path: resolve(screenshotsDir, "04-export-history-1280x800.png") })

  await renderSmallPromo(page)
  await renderMarqueePromo(page)
  await writeUploadGuide()
  console.log(`Store assets generated in ${outDir}`)
} finally {
  await browser.close()
  server.close()
}

async function startServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      let url = req.url?.split("?")[0] || "/"
      url = decodeURIComponent(url)
      if (url === "/") url = "/docs/release/store-assets/source/store-assets-harness.html"
      const filePath = join(rootDir, url)
      const data = await fs.readFile(filePath)
      const ext = extname(filePath).toLowerCase()
      const contentType =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".png"
              ? "image/png"
              : "application/octet-stream"
      res.writeHead(200, { "Content-Type": contentType, "Access-Control-Allow-Origin": "*" })
      res.end(data)
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end(`Not found: ${req.url}`)
    }
  })
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => resolveServer({ server, port: server.address().port }))
  })
}

async function settle(page) {
  await page.evaluate(() => document.fonts?.ready?.catch?.(() => undefined))
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 900))
}

function imageUrl(seed) {
  const palette = [
    ["#0a84ff", "#ff2442", "#141416"],
    ["#ff9f0a", "#30d158", "#111113"],
    ["#af52de", "#5ac8fa", "#18181b"],
    ["#ff5a5f", "#ffd60a", "#101012"],
    ["#64d2ff", "#bf5af2", "#151518"],
    ["#ff375f", "#0a84ff", "#0c0c0f"],
  ][seed % 6]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette[0]}"/>
          <stop offset="0.58" stop-color="${palette[2]}"/>
          <stop offset="1" stop-color="${palette[1]}"/>
        </linearGradient>
        <radialGradient id="r" cx=".18" cy=".18" r=".72">
          <stop offset="0" stop-color="rgba(255,255,255,.72)"/>
          <stop offset=".35" stop-color="rgba(255,255,255,.08)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="900" height="900" fill="url(#g)"/>
      <circle cx="${190 + (seed % 5) * 80}" cy="${180 + (seed % 3) * 50}" r="${170 + (seed % 4) * 22}" fill="url(#r)" opacity=".72"/>
      <rect x="${120 + (seed % 4) * 38}" y="${470 - (seed % 3) * 36}" width="${520 - (seed % 5) * 28}" height="210" rx="46" fill="rgba(255,255,255,.13)" transform="rotate(${-11 + (seed % 6) * 4} 450 560)"/>
      <path d="M 0 ${680 - (seed % 4) * 45} C 210 ${570 + (seed % 3) * 35}, 415 ${760 - (seed % 4) * 30}, 900 ${610 + (seed % 5) * 28} L 900 900 L 0 900 Z" fill="rgba(255,255,255,.10)"/>
      <text x="58" y="815" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="42" font-weight="700" fill="rgba(255,255,255,.72)">XHS · ${String(seed + 1).padStart(2, "0")}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function makeSampleData() {
  const now = Date.now()
  const collections = [
    {
      id: "store_col_inspiration",
      name: "灵感参考",
      color: "#FF2442",
      createdAt: new Date(now - 6 * 86400000).toISOString(),
      updatedAt: new Date(now - 3600000).toISOString(),
      sortOrder: 0,
      pinned: true,
    },
    {
      id: "store_col_video",
      name: "视频脚本",
      color: "#0A84FF",
      createdAt: new Date(now - 5 * 86400000).toISOString(),
      updatedAt: new Date(now - 2 * 3600000).toISOString(),
      sortOrder: 1,
      pinned: false,
    },
    {
      id: "store_col_export",
      name: "待导出",
      color: "#FFD60A",
      createdAt: new Date(now - 4 * 86400000).toISOString(),
      updatedAt: new Date(now - 3 * 3600000).toISOString(),
      sortOrder: 2,
      pinned: false,
    },
  ]
  const titles = ["城市夜景扫街", "周末 brunch 灵感", "极简海报版式", "咖啡店空间参考", "秋日穿搭分享", "家居改造记录", "日落延时素材", "街头人文抓拍", "手冲咖啡教程", "旅行清单封面"]
  const authors = ["老王摄影", "设计灵感库", "旅行手记", "日常穿搭", "家居美学", "咖啡探店"]
  const noteId = "665f4f2b000000001203abcd"
  const items = Array.from({ length: 42 }, (_, index) => {
    const isVideo = index % 7 === 0
    const coverUrl = imageUrl(index)
    const collectionIds =
      index % 5 === 0
        ? ["store_col_video"]
        : index % 3 === 0
          ? ["store_col_inspiration"]
          : index % 4 === 0
            ? ["store_col_export"]
            : undefined

    return {
      id: `store_item_${String(index + 1).padStart(2, "0")}`,
      url: isVideo ? "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" : coverUrl,
      type: isVideo ? "video" : "image",
      platform: "xiaohongshu",
      title: `${titles[index % titles.length]}${index < 6 ? ` ${index + 1}` : ""}`,
      sourceUrl: `https://www.xiaohongshu.com/explore/${noteId}`,
      collectedAt: new Date(now - index * 2.8 * 3600000).toISOString(),
      coverUrl,
      author: authors[index % authors.length],
      width: isVideo ? 1080 : 1440,
      height: isVideo ? 1920 : 1080,
      noteId: index < 6 ? noteId : undefined,
      groupIndex: index < 6 ? index : undefined,
      collectionIds,
      exportedAt: index % 6 === 0 ? new Date(now - index * 3600000).toISOString() : undefined,
    }
  })
  const history = [
    {
      id: "store_export_1",
      createdAt: new Date(now - 1.5 * 3600000).toISOString(),
      total: 8,
      successCount: 8,
      failedCount: 0,
      folders: ["灵感参考"],
      itemIds: items.slice(0, 8).map((item) => item.id),
    },
    {
      id: "store_export_2",
      createdAt: new Date(now - 26 * 3600000).toISOString(),
      total: 6,
      successCount: 4,
      failedCount: 2,
      folders: ["视频脚本", "待导出"],
      itemIds: items.slice(8, 12).map((item) => item.id),
      failedFiles: [
        {
          id: items[12].id,
          url: items[12].url,
          filename: "视频脚本/日落延时素材.mp4",
          platform: "xiaohongshu",
          error: "HTTP 429",
        },
        {
          id: items[13].id,
          url: items[13].url,
          filename: "待导出/咖啡店空间参考.jpg",
          platform: "xiaohongshu",
          error: "网络超时",
        },
      ],
    },
  ]
  return { items, collections, history }
}

async function renderSmallPromo(page) {
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 })
  await page.evaluate(() => {
    document.documentElement.innerHTML = `
      <html>
        <head>
          <style>
            * { box-sizing: border-box; }
            body {
              margin: 0;
              width: 440px;
              height: 280px;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif;
              background: radial-gradient(circle at 88% 16%, rgba(255,36,66,.26), transparent 36%), radial-gradient(circle at 12% 86%, rgba(10,132,255,.24), transparent 34%), linear-gradient(135deg, #151518 0%, #0b0b0d 100%);
              color: white;
            }
            .wrap { position: relative; width: 440px; height: 280px; padding: 30px 30px 26px; display: flex; flex-direction: column; justify-content: space-between; }
            .brand { display: flex; align-items: center; gap: 11px; }
            .logo { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #7ad7ff, #0a84ff); display: grid; place-items: center; box-shadow: 0 10px 24px rgba(10,132,255,.36); }
            .logo svg { width: 21px; height: 21px; }
            .name { font-size: 16px; font-weight: 700; letter-spacing: 0; }
            h1 { margin: 0; width: 260px; font-size: 31px; line-height: 1.08; font-weight: 800; letter-spacing: 0; }
            p { margin: 10px 0 0; width: 265px; color: rgba(255,255,255,.72); font-size: 13px; line-height: 1.55; font-weight: 500; }
            .mock { position: absolute; right: -12px; bottom: 18px; width: 172px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; transform: rotate(-4deg); }
            .tile { height: 74px; border-radius: 12px; overflow: hidden; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.12); box-shadow: 0 18px 36px rgba(0,0,0,.42); }
            .tile:nth-child(1) { background-image: linear-gradient(135deg, #0a84ff, #151518 55%, #ff2442); }
            .tile:nth-child(2) { background-image: linear-gradient(135deg, #ff9f0a, #111113 55%, #30d158); }
            .tile:nth-child(3) { background-image: linear-gradient(135deg, #af52de, #18181b 55%, #5ac8fa); }
            .tile:nth-child(4) { background-image: linear-gradient(135deg, #ff5a5f, #101012 55%, #ffd60a); }
            .chip { display: inline-flex; align-items: center; width: fit-content; height: 28px; padding: 0 12px; border-radius: 999px; background: rgba(255,36,66,.18); color: #ff5f73; border: 1px solid rgba(255,36,66,.28); font-size: 12px; font-weight: 700; }
          </style>
        </head>
        <body>
          <main class="wrap">
            <div class="brand">
              <div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div>
              <div class="name">素材采集助手</div>
            </div>
            <section><div class="chip">小红书素材管理</div><h1>采集、收藏、批量导出</h1><p>点开笔记后一键采集图片/视频，在本地全屏素材库中统一管理。</p></section>
            <div class="mock" aria-hidden="true"><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div></div>
          </main>
        </body>
      </html>
    `
  })
  await settle(page)
  await page.screenshot({ path: resolve(promosDir, "small-promo-440x280.png"), clip: { x: 0, y: 0, width: 440, height: 280 } })
}

async function renderMarqueePromo(page) {
  await page.setViewport({ width: 1400, height: 560, deviceScaleFactor: 1 })
  await page.evaluate(() => {
    document.documentElement.innerHTML = `
      <html><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; width: 1400px; height: 560px; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif; background: radial-gradient(circle at 88% 14%, rgba(255,36,66,.18), transparent 28%), radial-gradient(circle at 12% 78%, rgba(10,132,255,.22), transparent 30%), linear-gradient(135deg, #151518 0%, #09090b 100%); color: white; }
      .wrap { position: relative; width: 1400px; height: 560px; padding: 58px 70px; overflow: hidden; }
      .brand { display: flex; align-items: center; gap: 14px; }
      .logo { width: 48px; height: 48px; border-radius: 14px; background: linear-gradient(135deg, #7ad7ff, #0a84ff); display: grid; place-items: center; box-shadow: 0 12px 30px rgba(10,132,255,.34); }
      .logo svg { width: 28px; height: 28px; }
      .name { font-size: 22px; font-weight: 800; }
      .copy { margin-top: 58px; width: 555px; }
      .chip { display: inline-flex; align-items: center; height: 34px; padding: 0 15px; border-radius: 999px; background: rgba(255,36,66,.18); color: #ff6c7d; border: 1px solid rgba(255,36,66,.28); font-size: 14px; font-weight: 700; }
      h1 { margin: 18px 0 0; font-size: 60px; line-height: 1.02; letter-spacing: 0; font-weight: 850; }
      p { margin: 20px 0 0; color: rgba(255,255,255,.72); font-size: 21px; line-height: 1.55; font-weight: 500; }
      .panel { position: absolute; right: 56px; top: 62px; width: 650px; height: 436px; border-radius: 22px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 32px 90px rgba(0,0,0,.48); padding: 18px; display: grid; grid-template-columns: 128px 1fr; gap: 16px; }
      .side { border-right: 1px solid rgba(255,255,255,.08); padding-right: 12px; }
      .nav { height: 28px; border-radius: 8px; margin-bottom: 8px; background: rgba(255,255,255,.08); }
      .nav.active { background: rgba(10,132,255,.22); }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
      .stat { height: 70px; border-radius: 13px; background: rgba(255,255,255,.08); }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
      .tile { height: 103px; border-radius: 13px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.10); }
      .tile:nth-child(1) { background-image: linear-gradient(135deg, #0a84ff, #151518 55%, #ff2442); }
      .tile:nth-child(2) { background-image: linear-gradient(135deg, #ff9f0a, #111113 55%, #30d158); }
      .tile:nth-child(3) { background-image: linear-gradient(135deg, #af52de, #18181b 55%, #5ac8fa); }
      .tile:nth-child(4) { background-image: linear-gradient(135deg, #ff5a5f, #101012 55%, #ffd60a); }
      .tile:nth-child(5) { background-image: linear-gradient(135deg, #64d2ff, #151518 55%, #bf5af2); }
      .tile:nth-child(6) { background-image: linear-gradient(135deg, #ff375f, #0c0c0f 55%, #0a84ff); }
      .tile:nth-child(7) { background-image: linear-gradient(135deg, #30d158, #121214 55%, #ffd60a); }
      .tile:nth-child(8) { background-image: linear-gradient(135deg, #bf5af2, #151518 55%, #64d2ff); }
      </style></head><body>
      <main class="wrap">
        <div class="brand"><div class="logo"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg></div><div class="name">素材采集助手</div></div>
        <section class="copy"><div class="chip">小红书素材管理</div><h1>采集、收藏、批量导出</h1><p>点开笔记后一键采集图片/视频，在本地全屏素材库中统一管理。</p></section>
        <section class="panel" aria-hidden="true"><div class="side"><div class="nav active"></div><div class="nav"></div><div class="nav"></div><div class="nav"></div></div><div><div class="stats"><div class="stat"></div><div class="stat"></div><div class="stat"></div></div><div class="grid"><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div><div class="tile"></div></div></div></section>
      </main></body></html>
    `
  })
  await settle(page)
  await page.screenshot({ path: resolve(promosDir, "marquee-promo-1400x560.png"), clip: { x: 0, y: 0, width: 1400, height: 560 } })
}

async function writeUploadGuide() {
  const guide = `# Chrome Web Store 素材包

生成时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}

## 可上传文件

- 图标: \`docs/release/store-assets/icon-128.png\` (128x128)
- 截图 1: \`docs/release/store-assets/screenshots/01-library-overview-1280x800.png\`
- 截图 2: \`docs/release/store-assets/screenshots/02-batch-selection-export-1280x800.png\`
- 截图 3: \`docs/release/store-assets/screenshots/03-preview-modal-1280x800.png\`
- 截图 4: \`docs/release/store-assets/screenshots/04-export-history-1280x800.png\`
- 小宣传图: \`docs/release/store-assets/promos/small-promo-440x280.png\`
- 可选大横幅: \`docs/release/store-assets/promos/marquee-promo-1400x560.png\`

## 推荐上传顺序

1. 上传 128x128 图标。
2. 上传 4 张 1280x800 截图。
3. 上传 440x280 小宣传图。
4. 如果后台展示 marquee / large promo 位置,再上传 1400x560 大横幅。

## 说明

- 截图加载生产版 \`build/chrome-mv3-prod/tabs/library.*.js\`,并用本地 harness mock Chrome API。
- 样本数据只包含小红书平台,避免商店素材暗示当前支持抖音采集。
- 宣传图文案只承诺当前发布范围:小红书素材采集与本地管理。
`

  await fs.writeFile(resolve(outDir, "README.md"), guide)
}
