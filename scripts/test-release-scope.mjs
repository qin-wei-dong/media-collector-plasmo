// scripts/test-release-scope.mjs — release-scope smoke checks for the public XHS build

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8")
}

const pkg = JSON.parse(read("package.json"))
assert.deepEqual(pkg.manifest.host_permissions, ["https://www.xiaohongshu.com/*"])
assert.deepEqual(pkg.manifest.permissions, [
  "storage",
  "downloads",
  "scripting",
  "contextMenus",
  "notifications",
  "tabs",
])

const sampleRaw = execFileSync(
  process.execPath,
  [path.join(ROOT, "scripts", "generate-sample-items.mjs"), "80", "--json"],
  { encoding: "utf8" }
)
const sample = JSON.parse(sampleRaw)
assert.equal(sample.items.length, 80)
assert.ok(sample.items.every((item) => item.platform === "xiaohongshu"))
assert.ok(sample.items.every((item) => item.sourceUrl.startsWith("https://www.xiaohongshu.com/")))

const runtimeFiles = [
  "types.ts",
  "tabs/library.tsx",
  "background/index.ts",
  "background/download.ts",
  "lib/design-tokens.ts",
  "scripts/a11y-audit.mjs",
]
for (const relPath of runtimeFiles) {
  const content = read(relPath)
  assert.equal(content.includes('"douyin"'), false, `${relPath} contains a runtime douyin platform literal`)
  assert.equal(content.includes("theme.douyin"), false, `${relPath} still references theme.douyin`)
}

const releaseDocs = [
  "README.md",
  "docs/release/chrome-web-store-listing.md",
  "docs/release/privacy.md",
  "docs/index.html",
]
for (const relPath of releaseDocs) {
  const content = read(relPath)
  assert.equal(content.includes("activeTab"), false, `${relPath} still mentions activeTab`)
}

const checklist = read("docs/release/release-checklist.md")
assert.ok(checklist.includes("permissions` does not include `activeTab`"))

const readme = read("README.md")
assert.ok(readme.includes("深色主题优先"))
assert.ok(readme.includes("打开下载目录"))
assert.ok(readme.includes("保留系统通知"))
assert.equal(readme.includes("主题切换"), false)
assert.equal(readme.includes("打开文件夹"), false)

const bg = read("background/index.ts")
assert.ok(bg.includes("documentUrlPatterns: [XHS_CONTEXT_MENU_PATTERN]"))
assert.ok(bg.includes('https://www.xiaohongshu.com/*'))
assert.ok(bg.includes("仅支持小红书页面"))

console.log("release scope checks passed")
