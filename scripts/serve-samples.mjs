// scripts/serve-samples.mjs
// 简易本地静态服务,把 /tmp/mc-samples-*.json 暴露给 Chrome 扩展 DevTools fetch 用。
// 启动: node scripts/serve-samples.mjs
// 默认端口 8765,可 PORT=8888 node scripts/serve-samples.mjs 改端口。

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

const PORT = parseInt(process.env.PORT || "8765", 10)
const SAMPLES_DIR = "/tmp"

const server = createServer(async (req, res) => {
  // 仅允许 /tmp/mc-samples-*.json 文件
  const match = req.url?.match(/^\/mc-samples-(\d+)\.json$/)
  if (!match) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end("Not Found. Use /mc-samples-{100,500,1000}.json")
    return
  }
  const filePath = resolve(SAMPLES_DIR, `mc-samples-${match[1]}.json`)
  try {
    const data = await readFile(filePath)
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    })
    res.end(data)
    console.log(`[${new Date().toISOString()}] served ${filePath} (${data.length} bytes)`)
  } catch (err) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
    res.end(`File not found: ${filePath}`)
  }
})

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ sample server listening on http://127.0.0.1:${PORT}`)
  console.log(`   files: /mc-samples-100.json, /mc-samples-500.json, /mc-samples-1000.json`)
  console.log(`   press Ctrl+C to stop`)
})
