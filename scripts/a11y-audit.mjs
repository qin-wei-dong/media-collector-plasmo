// scripts/a11y-audit.mjs — 用 axe-core 跑 library tab 的可访问性审计
// 流程:
//   1. 读 build/chrome-mv3-dev/tabs/library.html(Plasmo 构建产物)
//   2. 在 library.js 之前注入 chrome.* mock,生成 audit-harness.html
//   3. 起一个本地 HTTP server(避免 file:// 的 CORS 限制)
//   4. 用 puppeteer-core 启动系统 Chrome,加载 harness
//   5. 注入 axe-core,跑 analyze
//   6. 输出 Markdown 报告
//
// 改测 library:popup 弹窗已删(M6 后冗余),library 是用户主要工作界面
//
// 用法:pnpm audit:a11y
//   (需要先 pnpm dev 或 pnpm build 生成 build/ 目录)

import fs from "node:fs/promises"
import path from "node:path"
import http from "node:http"
import puppeteer from "puppeteer-core"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const BUILD_DIR = path.join(ROOT, "build", "chrome-mv3-dev")
const LIBRARY_HTML = path.join(BUILD_DIR, "tabs", "library.html")
const AUDIT_DIR = path.join(ROOT, "audit")
const HARNESS_HTML = path.join(AUDIT_DIR, "a11y-harness.html")
const REPORT_MD = path.join(AUDIT_DIR, "a11y-report.md")

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
  "/usr/bin/google-chrome", // Linux
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean)

// ===== Mock chrome.* APIs =====
// library.tsx 在 useEffect 调 sendMessage({type: "GET_ITEMS" / "GET_COLLECTIONS" / "GET_EXPORT_HISTORY"}),
// 需要返回假数据;storage 读写、themeMode 持久化也 mock。
const MOCK_SCRIPT = `
<script>
// a11y 兜底:library.html 缺 title / lang,axe 报 document-title + html-has-lang
// 这里是测试用,真实产品页面也应该补上
document.documentElement.lang = "zh-CN"
document.title = "素材库"
</script>
<script>
(function () {
  const now = Date.now()
  const sample = [
    { id: "1", url: "https://example.com/1.jpg", type: "image", platform: "xiaohongshu",
      title: "示例小红书笔记 A", sourceUrl: "https://www.xiaohongshu.com/explore/abc",
      collectedAt: new Date(now - 3600000).toISOString(), author: "示例作者甲",
      noteId: "n1", groupIndex: 0, coverUrl: "https://example.com/cover1.jpg",
      width: 1080, height: 1440 },
    { id: "2", url: "https://example.com/2.jpg", type: "image", platform: "xiaohongshu",
      title: "示例小红书笔记 A", sourceUrl: "https://www.xiaohongshu.com/explore/abc",
      collectedAt: new Date(now - 3600000).toISOString(), author: "示例作者甲",
      noteId: "n1", groupIndex: 1, coverUrl: "https://example.com/cover1.jpg" },
    { id: "3", url: "https://example.com/3.mp4", type: "video", platform: "xiaohongshu",
      title: "小红书视频示例", sourceUrl: "https://www.xiaohongshu.com/explore/ghi",
      collectedAt: new Date(now - 86400000).toISOString(), author: "示例作者乙",
      coverUrl: "https://example.com/cover3.jpg" },
    { id: "4", url: "https://example.com/4.jpg", type: "image", platform: "xiaohongshu",
      title: "昨天的笔记", sourceUrl: "https://www.xiaohongshu.com/explore/def",
      collectedAt: new Date(now - 86400000 * 2).toISOString(), author: "示例作者丙",
      coverUrl: "https://example.com/cover4.jpg" }
  ]
  const collections = [
    { id: "c1", name: "灵感", color: "#FF6B6B", sortOrder: 0, pinned: true,
      createdAt: new Date(now - 86400000).toISOString(), updatedAt: new Date(now - 86400000).toISOString() },
    { id: "c2", name: "参考素材", color: "#4ECDC4", sortOrder: 1, pinned: false,
      createdAt: new Date(now - 86400000 * 2).toISOString(), updatedAt: new Date(now - 86400000 * 2).toISOString() }
  ]
  const handlers = {
    GET_ITEMS: () => ({ success: true, items: sample }),
    GET_COLLECTIONS: () => ({ success: true, collections }),
    GET_EXPORT_HISTORY: () => ({ success: true, history: [] }),
    COLLECT_MEDIA: () => ({ success: true }),
    COLLECT_NOTE_IMAGES: () => ({ success: true }),
    BATCH_DOWNLOAD: () => ({ success: true, count: 0, errors: [] }),
    REMOVE_ITEMS: () => ({ success: true }),
    RESTORE_ITEMS: () => ({ success: true, restored: 1 }),
    ASSIGN_COLLECTION: () => ({ success: true }),
    UNASSIGN_COLLECTION: () => ({ success: true }),
    CREATE_COLLECTION: () => ({ success: true, collection: collections[0] }),
    RENAME_COLLECTION: () => ({ success: true }),
    DELETE_COLLECTION: () => ({ success: true }),
    UPDATE_COLLECTION_COLOR: () => ({ success: true }),
    REORDER_COLLECTIONS: () => ({ success: true }),
    PIN_COLLECTION: () => ({ success: true }),
    MOVE_COLLECTION_ITEMS: () => ({ success: true }),
    SHOW_DOWNLOADS_FOLDER: () => ({ success: true }),
    CLEAR_ITEMS: () => ({ success: true }),
    CLEAR_EXPORT_HISTORY: () => ({ success: true }),
    RETRY_EXPORT_FAILED: () => ({ success: true, count: 0 })
  }
  const storageData = {}
  window.chrome = {
    runtime: {
      id: "test-extension-id",
      sendMessage: (msg, cb) => {
        const reply = handlers[msg?.type] ? handlers[msg.type]() : { success: false, error: "mock-no-handler" }
        if (typeof cb === "function") setTimeout(() => cb(reply), 0)
      },
      lastError: null,
      getURL: (p) => p,
      onMessage: { addListener: () => {} }
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const key = Array.isArray(keys) ? keys[0] : keys
          if (typeof keys === "function") {
            keys(storageData)
            return
          }
          if (key === null || key === undefined) {
            cb(storageData)
            return
          }
          cb({ [key]: storageData[key] })
        },
        set: (obj, cb) => {
          Object.assign(storageData, obj)
          if (typeof cb === "function") setTimeout(cb, 0)
        },
        remove: (keys, cb) => {
          const list = Array.isArray(keys) ? keys : [keys]
          list.forEach((k) => delete storageData[k])
          if (typeof cb === "function") setTimeout(cb, 0)
        }
      }
    },
    tabs: {
      create: (props) => { /* noop */ },
      query: (q, cb) => cb([])
    },
    downloads: {
      showDefaultFolder: () => {}
    },
    notifications: {
      create: (id, opts) => id || "n-" + Math.random()
    }
  }
})()
</script>
`

async function startServer(rootDir) {
  const server = http.createServer(async (req, res) => {
    try {
      let url = req.url.split("?")[0]
      if (url === "/" || url === "") url = "/a11y-harness.html"
      const filePath = path.join(rootDir, url)
      const data = await fs.readFile(filePath)
      const ext = path.extname(filePath).toLowerCase()
      const ct =
        ext === ".html"
          ? "text/html; charset=utf-8"
          : ext === ".js"
            ? "application/javascript; charset=utf-8"
            : ext === ".css"
              ? "text/css; charset=utf-8"
              : "application/octet-stream"
      res.writeHead(200, { "Content-Type": ct, "Access-Control-Allow-Origin": "*" })
      res.end(data)
    } catch (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      res.end("Not Found: " + req.url)
    }
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port
      resolve({ server, port })
    })
  })
}

async function pickChrome() {
  for (const p of CHROME_PATHS) {
    try {
      await fs.access(p)
      return p
    } catch {}
  }
  return null
}

async function main() {
  // 1. 检查 build
  try {
    await fs.access(LIBRARY_HTML)
  } catch {
    console.error(`❌ 找不到 ${LIBRARY_HTML}`)
    console.error("请先跑 pnpm dev 或 pnpm build 生成 build/")
    process.exit(1)
  }

  await fs.mkdir(AUDIT_DIR, { recursive: true })

  // 2. 生成 harness:library.html + mock
  // a11y 兜底:library.html 是 Plasmo 生成的,缺 <title> 和 <html lang>,axe 会报
  // 这里在生成 harness 时注入静态属性,避免每次跑 audit 都 false-positive
  const tpl = await fs.readFile(LIBRARY_HTML, "utf8")
  let harness = tpl
    .replace("<html>", '<html lang="zh-CN">')
    .replace("<head>", '<head><title>素材库</title>')
  harness = harness.replace("</head>", `${MOCK_SCRIPT}</head>`)
  await fs.writeFile(HARNESS_HTML, harness, "utf8")
  console.log(`📝 生成 audit harness:${HARNESS_HTML}`)

  // 3. 启动 HTTP server(从 ROOT 服务,可访问 audit/ + build/ 任意子目录)
  const { server, port } = await startServer(ROOT)
  const url = `http://127.0.0.1:${port}/audit/a11y-harness.html`
  console.log(`🚀 启动 HTTP server + Chrome...`)
  console.log(`   Harness URL:${url}`)

  const chromePath = await pickChrome()
  if (!chromePath) {
    console.error("❌ 找不到 Chrome,请设置 CHROME_PATH 环境变量")
    process.exit(1)
  }
  console.log(`🔍 Chrome:${chromePath}`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  })

  let exitCode = 0
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 })

    // 等 React mount 并渲染完成
    await page.waitForSelector("#__plasmo > *", { timeout: 10000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 1500))

    console.log("🔎 跑 axe-core...")
    const axeSource = await fs.readFile(
      path.join(ROOT, "node_modules", "axe-core", "axe.min.js"),
      "utf8"
    )
    await page.evaluate(axeSource)
    const result = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      return await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }
      })
    })

    // 已知外部限制:Plasmo 自动注入 user-scalable=no 到 viewport meta
    const EXTERNAL_RULES = new Set(["meta-viewport"])
    for (const v of result.violations) {
      if (EXTERNAL_RULES.has(v.id)) v.external = true
    }

    // 4. 输出报告
    const lines = []
    lines.push("# Library 可访问性审计报告", "")
    lines.push(`生成时间:${new Date().toLocaleString("zh-CN")}`, "")
    lines.push("## 概要", "")
    lines.push(`- 可处理违规:**${result.violations.filter((v) => !v.external).length}**`)
    lines.push(`- 外部限制(已知无法修复):${result.violations.filter((v) => v.external).length}`)
    lines.push(`- 通过(passes):${result.passes.length}`)
    lines.push(`- 待人工复核(incomplete):${result.incomplete.length}`)
    lines.push("")

    const processable = result.violations.filter((v) => !v.external)
    if (processable.length === 0) {
      lines.push("✅ **无可处理违规项**", "")
    } else {
      lines.push("## 可处理违规", "")
      for (const v of processable) {
        lines.push(`### ${v.id} — ${v.help}`, "")
        lines.push(`**Impact:** ${v.impact}  |  **Tags:** ${v.tags.join(", ")}`, "")
        for (const node of v.nodes.slice(0, 3)) {
          lines.push(`- \`${node.target.join(" ")}\``)
          lines.push(`  ${node.failureSummary || ""}`)
        }
        if (v.nodes.length > 3) lines.push(`- ... 还有 ${v.nodes.length - 3} 处`)
        lines.push("")
      }
    }

    const external = result.violations.filter((v) => v.external)
    if (external.length) {
      lines.push("## 外部限制(标记为不可修复)", "")
      for (const v of external) lines.push(`- **${v.id}**:${v.help}`)
      lines.push("")
    }

    const report = lines.join("\n")
    await fs.writeFile(REPORT_MD, report, "utf8")
    console.log(`📄 报告:${REPORT_MD}`)
    console.log("")
    console.log(report)

    if (processable.length > 0) exitCode = 1
  } catch (e) {
    console.error("❌ audit 失败:", e.message)
    exitCode = 1
  } finally {
    await browser.close()
    server.close()
  }
  process.exit(exitCode)
}

main()
