# 纯逻辑单测 + 导出路径函数抽出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 vitest 给关键纯逻辑补单测锁行为基线,并把 `library.tsx` 的导出路径函数抽到 `lib/export-path.ts`,为后续 LibraryPage 拆分铺安全网。

**Architecture:** 先引入 vitest(node 环境),再对现成纯函数(`isUnsafePath` / `getTimeBucket`)补测;然后把 `library.tsx` 内 5 个导出路径函数抽到 `lib/export-path.ts` 并补测;最后同步文档。全程零运行时行为变更。

**Tech Stack:** vitest(node environment)、TypeScript(strict)、Plasmo/React 既有栈。

**Spec:** `docs/superpowers/specs/2026-06-22-pure-logic-tests-design.md`

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `package.json` | Modify | 加 `vitest` devDep + `test`/`test:watch` scripts |
| `vitest.config.ts` | Create | vitest 配置(node 环境,`**/*.test.ts`) |
| `background/download.ts` | Modify | `isUnsafePath` 加 `export`(供测试) |
| `background/download.test.ts` | Create | `isUnsafePath` 路径穿越边界测试 |
| `lib/export-path.ts` | Create | 5 个导出路径函数 + `ExportContext`(从 library.tsx 抽出) |
| `tabs/library.tsx` | Modify | 删原 5 函数,改 import from `../lib/export-path` |
| `lib/export-path.test.ts` | Create | 导出路径 5 函数边界测试 |
| `lib/design-tokens.test.ts` | Create | `getTimeBucket` 时间分桶测试(mock 时间) |
| `CLAUDE.md` / `AGENTS.md` | Modify | verification/commands 加 `pnpm test` |

---

## Task 1: 引入 vitest 基础设施

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: 安装 vitest**

Run:
```bash
pnpm add -D vitest
```
Expected: `package.json` 的 `devDependencies` 出现 `vitest`,`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
})
```

- [ ] **Step 3: `package.json` 加 test scripts**

在 `scripts` 对象里(`"audit:a11y"` 之后)加两行:

```json
    "test": "vitest run",
    "test:watch": "vitest",
```

- [ ] **Step 4: 验证 vitest 装好**

Run:
```bash
pnpm exec vitest --version
```
Expected: 输出 vitest 版本号(证明安装成功)。

- [ ] **Step 5: 验证配置加载(此时无测试文件,报 no tests 属正常)**

Run:
```bash
pnpm test 2>&1 | head -20
```
Expected: vitest 启动并报 "No test files found" 或类似(证明 config 生效;下个 Task 加测试)。

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: 引入 vitest 测试框架"
```

---

## Task 2: `isUnsafePath` 测试

**Files:**
- Modify: `background/download.ts:40`
- Create: `background/download.test.ts`

- [ ] **Step 1: 写失败测试 `background/download.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import { isUnsafePath } from "./download"

describe("isUnsafePath", () => {
  it("拒绝 Unix 绝对路径", () => {
    expect(isUnsafePath("/etc/passwd")).toBe(true)
  })

  it("拒绝反斜杠开头的绝对路径", () => {
    expect(isUnsafePath("\\windows\\system32")).toBe(true)
  })

  it("拒绝 Windows 盘符绝对路径", () => {
    expect(isUnsafePath("C:\\Users\\x")).toBe(true)
    expect(isUnsafePath("D:/path/file")).toBe(true)
  })

  it("拒绝 . 和 .. 路径段", () => {
    expect(isUnsafePath("a/./b")).toBe(true)
    expect(isUnsafePath("a/../b")).toBe(true)
    expect(isUnsafePath("../secret")).toBe(true)
    expect(isUnsafePath("a/b/..")).toBe(true)
  })

  it("放行合法相对路径", () => {
    expect(isUnsafePath("a/b.jpg")).toBe(false)
    expect(isUnsafePath("folder/sub/name.ext")).toBe(false)
    expect(isUnsafePath("单层文件.jpg")).toBe(false)
  })

  it("不误伤名字含 .. 的合法文件名", () => {
    expect(isUnsafePath("5..2促销.jpg")).toBe(false)
    expect(isUnsafePath("v1..0/release.mp4")).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试验证 fail(函数未 export)**

Run:
```bash
pnpm test background/download.test.ts
```
Expected: FAIL —— `isUnsafePath is not exported` 或 import 报错。

- [ ] **Step 3: 改 `background/download.ts:40` 加 export**

把:
```ts
function isUnsafePath(filename: string): boolean {
```
改为:
```ts
export function isUnsafePath(filename: string): boolean {
```

- [ ] **Step 4: 跑测试验证 pass**

Run:
```bash
pnpm test background/download.test.ts
```
Expected: PASS —— 6 个 `it` 全绿。

- [ ] **Step 5: Commit**

```bash
git add background/download.ts background/download.test.ts
git commit -m "test: isUnsafePath 路径穿越防御边界"
```

---

## Task 3: 抽出 `lib/export-path.ts`

**Files:**
- Create: `lib/export-path.ts`
- Modify: `tabs/library.tsx`(删 L101-168 的 5 函数 + `ExportContext`,加 import)

- [ ] **Step 1: 创建 `lib/export-path.ts`**

```ts
// lib/export-path.ts — 导出路径解析(从 tabs/library.tsx 抽出,便于单测)
import type { Collection, MediaItem } from "../types"

/** 清洗路径段:去掉非法字符,折叠空白,限制长度;空或 `.` / `..` 回退。 */
export function sanitizePathSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value || "")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50)
  if (cleaned === "." || cleaned === "..") return fallback
  return cleaned || fallback
}

export interface ExportContext {
  collectionFilter: string
  collections: Collection[]
}

/**
 * 解析素材导出目录(M4 plan 4.1 优先级):
 * 1. 当前正在查看收藏夹 → 该收藏夹名
 * 2. 素材已归属收藏夹 → 按 collections 顺序第一个匹配,否则 collectionIds[0] 对应名
 * 3. 作者
 * 4. “未分类”
 */
export function resolveExportFolder(item: MediaItem, ctx: ExportContext): string {
  const nameById = (id: string) => ctx.collections.find((c) => c.id === id)?.name

  if (ctx.collectionFilter) {
    const name = nameById(ctx.collectionFilter)
    if (name) return sanitizePathSegment(name, "未分类")
  }

  const ids = item.collectionIds || []
  if (ids.length) {
    for (const c of ctx.collections) {
      if (ids.includes(c.id)) return sanitizePathSegment(c.name, "未分类")
    }
    const firstName = nameById(ids[0])
    if (firstName) return sanitizePathSegment(firstName, "未分类")
  }

  if (item.author) return sanitizePathSegment(item.author, "未分类")

  return "未分类"
}

/** 生成文件名(不含目录)。 */
export function buildExportFilename(item: MediaItem): string {
  const ext = item.type === "video" ? "mp4" : "jpg"
  const baseName = sanitizePathSegment(item.title, "素材")
  return item.groupIndex !== undefined
    ? `${baseName}_${String(item.groupIndex + 1).padStart(2, "0")}.${ext}`
    : `${baseName}.${ext}`
}

/** 完整相对路径:`<folder>/<filename>`。 */
export function buildExportPath(item: MediaItem, ctx: ExportContext): string {
  return `${resolveExportFolder(item, ctx)}/${buildExportFilename(item)}`
}

/** 汇总目录用于 Toast:无目录返回空串,单个返回其名,多个返回“多个文件夹”。 */
export function summarizeExportFolders(folders: string[]): string {
  const real = folders.filter(Boolean)
  if (real.length === 0) return ""
  if (real.length === 1) return real[0]
  return "多个文件夹"
}
```

- [ ] **Step 2: `tabs/library.tsx` 加 import**

在现有 import 块(第 6 行 `import { PreviewModal }...` 之后)加一行:

```ts
import { buildExportPath, summarizeExportFolders, type ExportContext } from "../lib/export-path"
```

- [ ] **Step 3: `tabs/library.tsx` 删除原定义**

删除第 101-168 行的整段(从 `// ===== M4 导出路径解析 =====` 注释到 `summarizeExportFolders` 函数的闭合 `}`,含 `sanitizePathSegment` / `ExportContext` / `resolveExportFolder` / `buildExportFilename` / `buildExportPath` / `summarizeExportFolders`)。

- [ ] **Step 4: 验证类型 + 构建(抽出未引入回归)**

Run:
```bash
pnpm exec tsc --noEmit && pnpm build
```
Expected: tsc 0 错误 + `plasmo build` DONE。

- [ ] **Step 5: Commit**

```bash
git add lib/export-path.ts tabs/library.tsx
git commit -m "refactor: 导出路径函数抽到 lib/export-path.ts"
```

---

## Task 4: 导出路径 5 函数测试

**Files:**
- Create: `lib/export-path.test.ts`

- [ ] **Step 1: 写测试 `lib/export-path.test.ts`**

```ts
import { describe, expect, it } from "vitest"
import type { Collection, MediaItem } from "../types"
import {
  buildExportFilename,
  buildExportPath,
  type ExportContext,
  resolveExportFolder,
  sanitizePathSegment,
  summarizeExportFolders,
} from "./export-path"

const item = (over: Partial<MediaItem> = {}): MediaItem => ({
  id: "1",
  url: "http://x/img.jpg",
  type: "image",
  platform: "xiaohongshu",
  title: "标题",
  sourceUrl: "",
  collectedAt: "2026-06-22T00:00:00Z",
  ...over,
})

const coll = (id: string, name: string): Collection => ({
  id,
  name,
  color: "#000",
  createdAt: "",
  updatedAt: "",
})

const ctx = (over: Partial<ExportContext> = {}): ExportContext => ({
  collectionFilter: "",
  collections: [],
  ...over,
})

describe("sanitizePathSegment", () => {
  it("替换非法字符为 -", () => {
    expect(sanitizePathSegment("a/b?c*d:e", "x")).toBe("a-b-c-d-e")
  })
  it("折叠空白并 trim", () => {
    expect(sanitizePathSegment("  a   b  ", "x")).toBe("a b")
  })
  it("截断到 50 字符", () => {
    expect(sanitizePathSegment("啊".repeat(60), "x").length).toBe(50)
  })
  it("空 / . / .. / undefined 回退 fallback", () => {
    expect(sanitizePathSegment("", "fb")).toBe("fb")
    expect(sanitizePathSegment(".", "fb")).toBe("fb")
    expect(sanitizePathSegment("..", "fb")).toBe("fb")
    expect(sanitizePathSegment(undefined, "fb")).toBe("fb")
  })
  it("正常值原样保留", () => {
    expect(sanitizePathSegment("小红书笔记", "x")).toBe("小红书笔记")
  })
})

describe("resolveExportFolder", () => {
  it("collectionFilter 命中 → 该收藏夹名", () => {
    const c = ctx({ collectionFilter: "c1", collections: [coll("c1", "灵感")] })
    expect(resolveExportFolder(item(), c)).toBe("灵感")
  })
  it("collectionFilter 命中但收藏夹名需净化", () => {
    const c = ctx({ collectionFilter: "c1", collections: [coll("c1", "a/b")] })
    expect(resolveExportFolder(item(), c)).toBe("a-b")
  })
  it("collectionIds 按 collections 顺序首个匹配(非 ids 顺序)", () => {
    const c = ctx({ collections: [coll("c2", "B"), coll("c1", "A")] })
    // collections 里 c2 在前,虽然 ids 里 c1 在前,仍返回 B
    expect(resolveExportFolder(item({ collectionIds: ["c1", "c2"] }), c)).toBe("B")
  })
  it("collectionIds 无任何 collection 匹配 → 落到作者", () => {
    const c = ctx({ collections: [] })
    expect(resolveExportFolder(item({ collectionIds: ["c9"], author: "张三" }), c)).toBe("张三")
  })
  it("无收藏夹 → 作者", () => {
    expect(resolveExportFolder(item({ author: "张三" }), ctx())).toBe("张三")
  })
  it("全无 → 未分类", () => {
    expect(resolveExportFolder(item(), ctx())).toBe("未分类")
  })
})

describe("buildExportFilename", () => {
  it("image → jpg", () => {
    expect(buildExportFilename(item({ type: "image" }))).toBe("标题.jpg")
  })
  it("video → mp4", () => {
    expect(buildExportFilename(item({ type: "video" }))).toBe("标题.mp4")
  })
  it("groupIndex → 两位序号(从 01 起)", () => {
    expect(buildExportFilename(item({ groupIndex: 0 }))).toBe("标题_01.jpg")
    expect(buildExportFilename(item({ groupIndex: 11 }))).toBe("标题_12.jpg")
  })
  it("空标题 → 素材回退", () => {
    expect(buildExportFilename(item({ title: "" }))).toBe("素材.jpg")
  })
  it("标题含非法字符 → 净化", () => {
    expect(buildExportFilename(item({ title: "a/b?c" }))).toBe("a-b-c.jpg")
  })
})

describe("buildExportPath", () => {
  it("folder + filename 拼接", () => {
    const i = item({ author: "张三", groupIndex: 0 })
    expect(buildExportPath(i, ctx())).toBe("张三/标题_01.jpg")
  })
})

describe("summarizeExportFolders", () => {
  it("空数组 → 空串", () => {
    expect(summarizeExportFolders([])).toBe("")
  })
  it("全空字符串 → 空串(filter Boolean)", () => {
    expect(summarizeExportFolders(["", ""])).toBe("")
  })
  it("单个 → 其名", () => {
    expect(summarizeExportFolders(["灵感"])).toBe("灵感")
  })
  it("多个 → 多个文件夹", () => {
    expect(summarizeExportFolders(["a", "b"])).toBe("多个文件夹")
  })
})
```

- [ ] **Step 2: 跑测试验证 pass(函数行为已正确,测的是抽出后无回归)**

Run:
```bash
pnpm test lib/export-path.test.ts
```
Expected: PASS —— 全部 describe/it 绿。若有 FAIL,说明 Task 3 抽出引入偏差,对照 `lib/export-path.ts` 修正。

- [ ] **Step 3: Commit**

```bash
git add lib/export-path.test.ts
git commit -m "test: 导出路径 5 函数边界"
```

---

## Task 5: `getTimeBucket` 测试(mock 时间)

**Files:**
- Create: `lib/design-tokens.test.ts`

> `getTimeBucket` 内部用 `new Date()` 取当前时间,测试必须 mock,否则结果随运行时刻漂移。用本地时间构造 + 相对偏移,避免硬编码 UTC 字符串的时区陷阱。

- [ ] **Step 1: 写测试 `lib/design-tokens.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTimeBucket, TIME_ORDER } from "./design-tokens"

describe("getTimeBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 本地时间 2026-06-22 12:00(月从 0 起,5 = 6 月)
    vi.setSystemTime(new Date(2026, 5, 22, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // 相对 now 的偏移生成 ISO,避免时区硬编码
  const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString()

  it("今天", () => {
    expect(getTimeBucket(iso(0))).toBe("今天") // 现在
    expect(getTimeBucket(iso(3600_000))).toBe("今天") // 1 小时前
  })

  it("昨天", () => {
    // 12:00 往前 25 小时 = 前一天 11:00,落在昨天
    expect(getTimeBucket(iso(25 * 3600_000))).toBe("昨天")
  })

  it("本周", () => {
    expect(getTimeBucket(iso(3 * 86400_000))).toBe("本周") // 3 天前
  })

  it("更早", () => {
    expect(getTimeBucket(iso(30 * 86400_000))).toBe("更早") // 30 天前
  })

  it("TIME_ORDER 顺序", () => {
    expect(TIME_ORDER).toEqual(["今天", "昨天", "本周", "更早"])
  })
})
```

- [ ] **Step 2: 跑测试验证 pass**

Run:
```bash
pnpm test lib/design-tokens.test.ts
```
Expected: PASS —— 5 个 it 全绿。

- [ ] **Step 3: Commit**

```bash
git add lib/design-tokens.test.ts
git commit -m "test: getTimeBucket 时间分桶(mock 时间)"
```

---

## Task 6: 文档同步 + 最终全量验证

**Files:**
- Modify: `CLAUDE.md`(verification 节)
- Modify: `AGENTS.md`(commands 节)

- [ ] **Step 1: `CLAUDE.md` verification 加 `pnpm test`**

在 `## Verification commands (M5+)` 的代码块里(`pnpm build` 与 `pnpm audit:a11y` 之间)加一行:

```
pnpm test             # vitest 单元测试(纯逻辑)
```

- [ ] **Step 2: `AGENTS.md` commands 加 test**

在 `## Commands` 的代码块里(`pnpm package` 之后)加一行:

```
pnpm test        # vitest 单元测试(纯逻辑)
```

并在该节 `No test suite, no linter.` 一句改为 `No linter. vitest for unit tests (pure logic).`

- [ ] **Step 3: 最终全量验证**

Run:
```bash
pnpm test
```
Expected: 全部测试文件绿(`download.test.ts` + `export-path.test.ts` + `design-tokens.test.ts`)。

Run:
```bash
pnpm exec tsc --noEmit && pnpm build
```
Expected: tsc 0 错误 + build DONE。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md AGENTS.md
git commit -m "docs: verification/commands 加 pnpm test"
```

---

## Self-Review(plan 写完后自检)

- **Spec 覆盖**:spec §3.1 isUnsafePath → Task 2 ✅;§3.2 导出路径 5 件套 → Task 3(抽出)+ Task 4(测试)✅;§3.3 getTimeBucket → Task 5 ✅;§3.4 getDisplayCover → 本轮跳过(4 行 `||` 回退,ROI 低,spec 已授权)✅;§4 抽出 → Task 3 ✅;§5 vitest 配置 → Task 1 ✅;§6 文件组织 → 各 Task 就近放置 ✅;§7 验证 → Task 6 Step 3 ✅。
- **占位符**:无 TBD/TODO,每步含完整代码或确切命令。
- **类型一致**:`ExportContext` / `Collection` / `MediaItem` 字段在 export-path.ts 与 test 一致;`isUnsafePath` 签名一致。
