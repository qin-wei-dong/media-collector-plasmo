// scripts/a11y-audit.mjs — 用 axe-core 跑 popup 的可访问性审计
// 流程:
//   1. 读 build/chrome-mv3-dev/popup.html(Plasmo 构建产物)
//   2. 在 popup.js 之前注入 chrome.* mock,生成 audit-harness.html
//   3. 起一个本地 HTTP server(避免 file:// 的 CORS 限制)
//   4. 用 puppeteer-core 启动系统 Chrome,加载 harness
//   5. 注入 axe-core,跑 analyze
//   6. 输出 Markdown 报告
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
const POPUP_HTML = path.join(BUILD_DIR, "popup.html")
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
// popup.tsx 会在 useEffect 调 sendMessage({type: "GET_ITEMS"}),需要返回假数据;
// storage 读写、P3-21 的 themeMode 持久化也要 mock。
const MOCK_SCRIPT = `
<script>
(function () {
  const sample = [
    {
      id: "1", url: "https://example.com/1.jpg", type: "image",
      platform: "xiaohongshu", title: "示例小红书笔记 A",
      sourceUrl: "https://www.xiaohongshu.com/explore/abc",
      collectedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      author: "示例作者甲", noteId: "n1", groupIndex: 0,
      coverUrl: "https://example.com/cover1.jpg", width: 1080, height: 1440
    },
    {
      id: "2", url: "https://example.com/2.jpg", type: "image",
      platform: "xiaohongshu", title: "示例小红书笔记 A",
      sourceUrl: "https://www.xiaohongshu.com/explore/abc",
      collectedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      author: "示例作者甲", noteId: "n1", groupIndex: 1,
      coverUrl: "https://example.com/cover1.jpg"
    },
    {
      id: "3", url: "https://example.com/3.mp4", type: "video",
      platform: "douyin", title: "抖音视频示例",
      sourceUrl: "https://www.douyin.com/video/xyz",
      collectedAt: new Date(Date.now() - 86400 * 1000).toISOString(),
      author: "示例作者乙", coverUrl: "https://example.com/cover3.jpg"
    },
    {
      id: "4", url: "https://example.com/4.jpg", type: "image",
      platform: "xiaohongshu", title: "昨天的笔记",
      sourceUrl: "https://www.xiaohongshu.com/explore/def",
      collectedAt: new Date(Date.now() - 86400 * 1000 * 2).toISOString(),
      author: "示例作者丙", coverUrl: "https://example.com/cover4.jpg"
    }
  ]
  const storageData = {}
  const handlers = {
    GET_ITEMS: () => ({ items: sample }),
    COLLECT_MEDIA: () => ({ success: true }),
    COLLECT_NOTE_IMAGES: () => ({ success: true }),
    BATCH_DOWNLOAD: () => ({ success: true, errors: [] }),
    REMOVE_ITEMS: () => ({ success: true }),
    RESTORE_ITEMS: () => ({ success: true, restored: 1 }),
    INJECT_MAIN_WORLD: () => ({ success: true }),
    GET_LAST_MEDIA: () => ({ media: null }),
    CLEAR_ITEMS: () => ({ success: true }),
  }
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
        get: (k, cb) => {
          const keys = Array.isArray(k) ? k : [k]
          const out = {}
          keys.forEach((key) => { if (key in storageData) out[key] = storageData[key] })
          if (typeof cb === "function") setTimeout(() => cb(out), 0)
          return Promise.resolve(out)
        },
        set: (obj, cb) => {
          Object.assign(storageData, obj)
          if (typeof cb === "function") setTimeout(() => cb(), 0)
          return Promise.resolve()
        }
      }
    },
    tabs: { create: () => {} },
    notifications: { create: () => {} }
  }
})()
</script>
`

async function findChrome() {
  for (const p of CHROME_PATHS) {
    try {
      await fs.access(p)
      return p
    } catch {}
  }
  throw new Error("找不到 Chrome,可执行文件路径: " + CHROME_PATHS.join(" / "))
}

async function generateHarness() {
  const tpl = await fs.readFile(POPUP_HTML, "utf8")
  // 在 <body> 之后立即注入 mock 脚本
  const injected = tpl.replace(/<body[^>]*>/, (m) => `${m}\n${MOCK_SCRIPT}`)
  await fs.mkdir(AUDIT_DIR, { recursive: true })
  await fs.writeFile(HARNESS_HTML, injected)
  return HARNESS_HTML
}

function startServer(dir) {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = decodeURIComponent(req.url.split("?")[0])
        const filePath = path.join(dir, url === "/" ? "/a11y-harness.html" : url)
        const data = await fs.readFile(filePath)
        const ext = path.extname(filePath).toLowerCase()
        const mime = ext === ".html" ? "text/html"
          : ext === ".js" ? "application/javascript"
          : ext === ".css" ? "text/css"
          : ext === ".png" ? "image/png"
          : "application/octet-stream"
        res.writeHead(200, { "Content-Type": `${mime}; charset=utf-8` })
        res.end(data)
      } catch {
        res.writeHead(404).end()
      }
    })
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port
      resolve({ server, port })
    })
  })
}

function generateReport(result) {
  const { violations, passes, incomplete } = result
  const actionable = violations.filter((v) => !v.external)
  const external = violations.filter((v) => v.external)

  const lines = []
  lines.push("# Popup 可访问性审计报告")
  lines.push("")
  lines.push(`生成时间:${new Date().toLocaleString()}`)
  lines.push("")
  lines.push("## 概要")
  lines.push("")
  lines.push(`- 可处理违规:**${actionable.length}**`)
  lines.push(`- 外部限制(已知无法修复):${external.length}`)
  lines.push(`- 通过(passes):${passes.length}`)
  lines.push(`- 待人工复核(incomplete):${incomplete.length}`)
  lines.push("")

  if (actionable.length === 0) {
    lines.push("✅ **无可处理违规项**")
    lines.push("")
  } else {
    const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 }
    actionable.forEach((v) => { counts[v.impact] = (counts[v.impact] || 0) + 1 })
    lines.push("### 按严重度")
    lines.push("")
    lines.push(`- 🔴 critical:${counts.critical}`)
    lines.push(`- 🟠 serious:${counts.serious}`)
    lines.push(`- 🟡 moderate:${counts.moderate}`)
    lines.push(`- ⚪ minor:${counts.minor}`)
    lines.push("")

    lines.push("## 违规明细(可处理)")
    lines.push("")
    for (const v of actionable) {
      const icon = v.impact === "critical" ? "🔴"
        : v.impact === "serious" ? "🟠"
        : v.impact === "moderate" ? "🟡"
        : "⚪"
      lines.push(`### ${icon} ${v.id} — ${v.help}`)
      lines.push("")
      lines.push(`- **严重度**:${v.impact}`)
      lines.push(`- **WCAG**:${v.tags.filter((t) => t.startsWith("wcag")).join(", ") || "—"}`)
      lines.push(`- **描述**:${v.description}`)
      lines.push(`- **节点数**:${v.nodes.length}`)
      if (v.helpUrl) lines.push(`- **参考**:${v.helpUrl}`)
      lines.push("")
      lines.push("**示例节点**:")
      lines.push("")
      v.nodes.slice(0, 3).forEach((n, i) => {
        lines.push(`${i + 1}. \`${n.target.join(" ")}\``)
        if (n.failureSummary) {
          lines.push(`   - ${n.failureSummary.split("\n").join("\n   - ")}`)
        }
      })
      if (v.nodes.length > 3) {
        lines.push(`   ... 还有 ${v.nodes.length - 3} 个节点`)
      }
      lines.push("")
    }
  }

  if (external.length > 0) {
    lines.push("## 外部限制(不计入审计结果)")
    lines.push("")
    lines.push("以下违规来自框架/工具默认行为,无法在源码层修复:")
    lines.push("")
    for (const v of external) {
      lines.push(`- **${v.id}** (${v.impact}):${v.help}`)
      lines.push(`  - 原因:Plasmo 自动注入 viewport meta 含 user-scalable=no`)
      lines.push(`  - 绕过:无,需 fork Plasmo 或 post-build patch`)
    }
    lines.push("")
  }

  if (incomplete.length > 0) {
    lines.push("## 待人工复核")
    lines.push("")
    lines.push("axe-core 无法自动判定,需人工确认是否构成问题:")
    lines.push("")
    for (const v of incomplete) {
      lines.push(`- **${v.id}** (${v.impact}):${v.help} — ${v.nodes.length} 节点`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

async function main() {
  // 1. 检查 build
  try {
    await fs.access(POPUP_HTML)
  } catch {
    console.error(`❌ 找不到 ${POPUP_HTML}`)
    console.error("请先跑 pnpm dev 或 pnpm build 生成 build/")
    process.exit(1)
  }

  // 2. 找 Chrome
  const chromePath = await findChrome()
  console.log(`🔍 Chrome:${chromePath}`)

  // 3. 生成 harness
  console.log("📝 生成 audit harness...")
  await generateHarness()

  // 4. 起 server + 启动 Chrome
  console.log("🚀 启动 HTTP server + Chrome...")
  const { server, port } = await startServer(BUILD_DIR)
  const url = `http://127.0.0.1:${port}/a11y-harness.html`
  console.log(`   Harness URL:${url}`)

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  })

  let exitCode = 0
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 460, height: 660 })
    await page.goto(url, { waitUntil: "networkidle0", timeout: 15000 })

    // 等 React mount 并渲染完成
    await page.waitForSelector("#__plasmo > *", { timeout: 10000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 800))

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

    // 已知外部限制:Plasmo 自动注入 user-scalable=no 到 viewport meta,
    // axe's meta-viewport 会报 moderate 违规,但我们无法在源码层修复。
    // 把这条标记为 "external" 方便区分实际待修复项。
    const EXTERNAL_RULES = new Set(["meta-viewport"])
    for (const v of result.violations) {
      if (EXTERNAL_RULES.has(v.id)) v.external = true
    }
    const actionable = result.violations.filter((v) => !v.external)

    // 5. 输出报告
    const md = generateReport(result)
    await fs.writeFile(REPORT_MD, md)
    console.log(`📄 报告:${REPORT_MD}`)
    console.log("")
    console.log(md.split("\n").slice(0, 12).join("\n"))

    if (actionable.some((v) => v.impact === "critical" || v.impact === "serious")) {
      exitCode = 1
    }
  } catch (e) {
    console.error("❌ 审计失败:", e)
    exitCode = 2
  } finally {
    await browser.close()
    server.close()
  }

  process.exit(exitCode)
}

main()
