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

console.log("release scope checks passed")
