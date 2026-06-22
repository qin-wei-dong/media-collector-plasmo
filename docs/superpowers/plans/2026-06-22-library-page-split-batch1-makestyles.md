# LibraryPage 拆分 — 批 1:makeStyles 抽出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `tabs/library.tsx` 的 `makeStyles`(~1032 行)抽到 `lib/library-styles.ts`,`library.tsx` 改 import。纯重构,UI 零变化。

**Architecture:** 机械迁移现有纯函数(`makeStyles: theme → Record<string, CSSProperties>` 映射),`library.tsx` 5 处 `useMemo(() => makeStyles(theme), [theme])` 改从 import 消费。零行为变化,47 测试 + tsc/build 做回归保护。

**Tech Stack:** TypeScript(strict)、React `CSSProperties`、Plasmo。

**Spec:** `docs/superpowers/specs/2026-06-22-library-page-split-design.md` §3(批 1)

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `lib/library-styles.ts` | Create | `makeStyles(theme)` → `Record<string, CSSProperties>`(从 library.tsx L1974-3006 迁出) |
| `tabs/library.tsx` | Modify | 删 `makeStyles` 定义,加 `import { makeStyles } from "../lib/library-styles"` |

---

## Task 1: 抽出 makeStyles 到 lib/library-styles.ts

**Files:**
- Create: `lib/library-styles.ts`
- Modify: `tabs/library.tsx`(删 L1974-3006 的 `makeStyles` 定义 + 加 import)

- [ ] **Step 1: 定位 library.tsx 里 makeStyles 的精确范围**

Run:
```bash
grep -nE "^const makeStyles|^const LibraryWithTheme" tabs/library.tsx
```
Expected: 找到 `const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => {`(约 L1974)及其之后的函数体(到文件尾 L3006 的闭合 `}`,在 `const LibraryWithTheme`/文件结尾前)。记下起止行号。

- [ ] **Step 2: 创建 `lib/library-styles.ts`**

新文件结构(头部 import + export 声明,函数体从 library.tsx 迁移):

```ts
// lib/library-styles.ts — Library UI 内联样式(从 tabs/library.tsx 迁出)
// 纯函数: theme → CSSProperties 映射。迁移自 library.tsx,逻辑零改动。
import type { CSSProperties } from "react"
import type { ThemeTokens } from "./design-tokens"

export const makeStyles = (theme: ThemeTokens): Record<string, CSSProperties> => {
  // ===== 函数体:从 tabs/library.tsx 的 makeStyles(L1974-3006)逐字迁移 =====
  // 把原代码 return 的整个样式对象(含所有样式键)原样粘贴到这里。
  // 若函数体内有 `React.CSSProperties` 类型注解,改为 `CSSProperties`(已 import type)。
  // 若函数体内引用了 design-tokens 的其他导出(如 getTimeBucket),补 import。
  // ↓↓↓ 迁移函数体 ↓↓↓
}
```

**迁移动作(给执行者):** Read `tabs/library.tsx` 的 `makeStyles` 函数(Step 1 定位的范围),把 `=> { ... }` 之间的函数体(即 `return { ... }` 整段样式对象)逐字粘贴到上面新文件的函数体位置。保留所有样式键与逻辑。若函数体内出现 `React.CSSProperties` 注解,替换为 `CSSProperties`(因新文件 `import type { CSSProperties }` 而非依赖 React 全局)。若函数体引用 `getTimeBucket` 等 design-tokens 导出,在文件头补 `import { getTimeBucket } from "./design-tokens"`。

- [ ] **Step 3: `tabs/library.tsx` 加 import**

在现有 import 块(`import { makeStyles } from ...` 尚不存在)加一行,与其他 lib import 放一起:

```ts
import { makeStyles } from "../lib/library-styles"
```

- [ ] **Step 4: `tabs/library.tsx` 删除原 makeStyles 定义**

删除 Step 1 定位的整段(从 `const makeStyles = (theme: ThemeTokens)...` 到其闭合 `}`,含函数体)。删后 `library.tsx` 不应再有 `makeStyles` 定义(`grep -n "const makeStyles" tabs/library.tsx` 应无结果)。5 处 `useMemo(() => makeStyles(theme), [theme])` 保持不变(现在消费 import 来的 makeStyles)。

- [ ] **Step 5: 验证类型 + 构建 + 测试零回归**

Run:
```bash
pnpm exec tsc --noEmit
```
Expected: 0 错误(若报 `React.CSSProperties` 未定义 → 函数体内还有遗漏的 React.CSSProperties,改 CSSProperties;若报 getTimeBucket 等未定义 → 补 import)。

Run:
```bash
pnpm build
```
Expected: `plasmo build` DONE。

Run:
```bash
pnpm test
```
Expected: 5 test files / 47 tests 全绿(纯重构,既有测试不受影响)。

- [ ] **Step 6: Commit**

```bash
git add lib/library-styles.ts tabs/library.tsx
git commit -m "refactor: makeStyles 抽到 lib/library-styles.ts(批1)"
```
(中文 message,结尾加 `Co-Authored-By: Claude <noreply@anthropic.com>` trailer)

- [ ] **Step 7: 手测 UI 样式无变化(用户验证)**

加载扩展,打开素材库,确认视觉与拆分前完全一致(主题切换 dark/light、网格/列表视图、卡片/对话框/Toast/侧栏样式)。**这一步必须用户在 Chrome 手测确认** —— 样式回归自动化测试覆盖不到。

---

## Self-Review(plan 写完后自检)

- **Spec 覆盖**:spec §3 批 1 全部要求(makeStyles 抽到 lib/library-styles.ts + library.tsx import + 5 处 useMemo 不变 + 验证)→ Task 1 各 Step 覆盖 ✅。
- **占位符**:Step 2 的"迁移函数体"是**现有代码移动指令**(精确指明来源 L1974-3006 + 替换规则 React.CSSProperties→CSSProperties + 补 import 规则),不是新代码 placeholder。makeStyles 函数体是既有 1032 行,plan 不重复粘贴(执行者从 library.tsx 读取迁移)。Step 1 先 grep 定位精确行号,避免行号漂移。
- **类型一致**:`makeStyles` 签名 `(theme: ThemeTokens) => Record<string, CSSProperties>` 与原 library.tsx 一致(仅 React.CSSProperties → CSSProperties,语义等价);import 来源 `./design-tokens`(ThemeTokens)与 library.tsx 现有 `../lib/design-tokens` 一致(新文件在 lib/,相对路径 `./design-tokens`)✅。
- **风险点**:Step 5 的 tsc 是关键安全网(遗漏的 React.CSSProperties / 未补的 import 都会被捕获)。

---

## 后续

批 1 合并后,批 2(6 组件抽出)和批 3(hooks 抽出)各自调 writing-plans 出 plan(基于 spec §4/§5)。每批独立验证 + 合并。
