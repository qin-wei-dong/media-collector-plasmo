# LibraryPage 拆分 — 批 2:6 组件抽出 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `tabs/library.tsx` 内联的 6 个组件(Icon/LibraryToast/LibraryCell/LibraryRow/CollectionDialog/ExportHistoryModal,~610 行)抽到 `components/`。纯重构,UI 零变化。

**Architecture:** 机械迁移现有组件到独立文件,各组件 props 接口即其现有签名(实施时从 library.tsx 读取迁移)。`Icon` 被其他组件依赖,最先抽。共享类型按归属放置。零行为变化,47 测试 + tsc/build 回归保护。

**Tech Stack:** TypeScript(strict)、React(`memo`/`CSSProperties`)、Plasmo。

**Spec:** `docs/superpowers/specs/2026-06-22-library-page-split-design.md` §4(批 2)

---

## File Structure

| 新文件 | 来源行 | 职责 | 共享类型归属 |
|---|---|---|---|
| `components/Icon.tsx` | L1837 | 16 种图标 + `IconName` | `IconName` 随 Icon 导出 |
| `components/LibraryToast.tsx` | L1807 | 底部 snackbar | `Notice` 随 Toast 导出 |
| `components/LibraryCell.tsx` | L1278 | 网格卡(`memo`) | — |
| `components/LibraryRow.tsx` | L1424 | 列表行(`memo`) | — |
| `components/CollectionDialog.tsx` | L1519 | 收藏夹 dialog | `DialogState` → `types.ts`(跨 LibraryPage+Dialog) |
| `components/ExportHistoryModal.tsx` | L1687 | 导出历史 modal | — |

**类型归属原则**:组件专属类型(`IconName`/`Notice`)随组件文件 export;跨文件类型(`DialogState`,被 LibraryPage + CollectionDialog 共用)迁到 `types.ts`。`Scope`/`ViewMode` 只 LibraryPage 用,暂留 library.tsx(批 3 hooks 若需再迁)。

**组件依赖**:Icon 被其他 5 个组件用 → Task 1 先抽 Icon;后续组件从 `./Icon` import。

---

## Task 1: 抽出 Icon + LibraryToast

**Files:**
- Create: `components/Icon.tsx`, `components/LibraryToast.tsx`
- Modify: `tabs/library.tsx`(删 Icon/LibraryToast 定义 + IconName/Notice 类型 + 加 import),`types.ts`(若需)

- [ ] **Step 1: 创建 `components/Icon.tsx`**
Read `tabs/library.tsx` L1837 起的 `Icon` 函数 + L30 的 `IconName` 类型。新文件:
```tsx
// components/Icon.tsx — Library UI 图标(从 tabs/library.tsx 迁出)
import type { CSSProperties } from "react"

export type IconName =
  | "box" | "bookmark" | "check" | "clock" | "download" | "external" | "filter"
  | "grid" | "image" | "list" | "plus" | "play" | "search" | "trash" | "user" | "view"

export function Icon({ name, size = 16, style, fill = "none" }: {
  name: IconName
  size?: number
  style?: CSSProperties
  fill?: string
}) {
  // ↓ 函数体从 library.tsx 的 Icon(L1837 起)逐字迁移(switch/对象返回 SVG) ↓
}
```
**迁移动作:** 把 library.tsx Icon 函数体逐字迁移。若原签名 props 与上面不一致(如缺 `fill`/`style`),按原签名调整(以原代码为准)。

- [ ] **Step 2: 创建 `components/LibraryToast.tsx`**
Read L1807 的 `LibraryToast` + L48 的 `Notice`。新文件:
```tsx
// components/LibraryToast.tsx — 底部 snackbar(从 tabs/library.tsx 迁出)
import type { CSSProperties } from "react"

export interface Notice {
  message: string
  actionLabel?: string
  onAction?: () => void
  kind?: "success" | "error" | "info"
}

export function LibraryToast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  // ↓ 函数体从 library.tsx 的 LibraryToast(L1807 起)逐字迁移 ↓
  // 若用 Icon,加 import { Icon } from "./Icon"
}
```

- [ ] **Step 3: `tabs/library.tsx` 加 import + 删定义**
- 加:`import { Icon, type IconName } from "../components/Icon"` + `import { LibraryToast, type Notice } from "../components/LibraryToast"`(按实际使用,若 library.tsx 直接用 IconName/Notice 类型则 import type)
- 删:library.tsx 的 `Icon` 函数(L1837)、`LibraryToast` 函数(L1807)、`IconName` 类型(L30)、`Notice` interface(L48)
- library.tsx 内其他组件(Cell/Row/Dialog/Modal)若用 Icon,现在通过 import 消费(同文件已无 Icon 定义)

- [ ] **Step 4: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误(漏 import/类型归属错会被捕获)
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 5: Commit**
```bash
git add components/Icon.tsx components/LibraryToast.tsx tabs/library.tsx
git commit -m "refactor: Icon/LibraryToast 抽到 components(批2-1)"
```
(中文 + `Co-Authored-By: Claude <noreply@anthropic.com>` trailer)

---

## Task 2: 抽出 LibraryCell + LibraryRow

**Files:**
- Create: `components/LibraryCell.tsx`, `components/LibraryRow.tsx`
- Modify: `tabs/library.tsx`

- [ ] **Step 1: 创建 `components/LibraryCell.tsx`**
Read L1278 的 `LibraryCell`(memo 包装)。新文件:
```tsx
// components/LibraryCell.tsx — 网格卡片(从 tabs/library.tsx 迁出)
import { memo } from "react"
import type { CSSProperties } from "react"
import type { MediaItem } from "../types"
import { Icon } from "./Icon"

interface LibraryCellProps {
  // ↓ 从 library.tsx LibraryCell 签名(L1278 起)逐字迁移所有 props ↓
  // 大致:item, selected, styles, onPreview, onToggle, onDownload, onOpenSource 等
}

export const LibraryCell = memo(function LibraryCell(props: LibraryCellProps) {
  // ↓ 函数体逐字迁移 ↓
})
```
**迁移动作:** Read L1278 起完整的 LibraryCell(含 memo + props 解构 + 函数体),整段迁移到新文件。props 接口从原签名提取(原是内联解构类型,改为显式 `interface LibraryCellProps`)。

- [ ] **Step 2: 创建 `components/LibraryRow.tsx`**
同样,Read L1424 的 `LibraryRow`(memo),整段迁移:
```tsx
// components/LibraryRow.tsx — 列表行(从 tabs/library.tsx 迁出)
import { memo } from "react"
import type { CSSProperties } from "react"
import type { MediaItem } from "../types"
import { Icon } from "./Icon"

interface LibraryRowProps {
  // ↓ 从 library.tsx LibraryRow 签名(L1424 起)逐字迁移 ↓
}

export const LibraryRow = memo(function LibraryRow(props: LibraryRowProps) {
  // ↓ 函数体逐字迁移 ↓
})
```

- [ ] **Step 3: `tabs/library.tsx` 加 import + 删定义**
- 加:`import { LibraryCell } from "../components/LibraryCell"` + `import { LibraryRow } from "../components/LibraryRow"`
- 删:library.tsx 的 `LibraryCell`(L1278)、`LibraryRow`(L1424)定义
- LibraryPage 里 `<LibraryCell ...>`/`<LibraryRow ...>` 使用点(L1032/L1050)不变,消费 import

- [ ] **Step 4: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误(漏 prop 会报错)
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 5: Commit**
```bash
git add components/LibraryCell.tsx components/LibraryRow.tsx tabs/library.tsx
git commit -m "refactor: LibraryCell/LibraryRow 抽到 components(批2-2)"
```

---

## Task 3: 抽出 CollectionDialog + ExportHistoryModal

**Files:**
- Create: `components/CollectionDialog.tsx`, `components/ExportHistoryModal.tsx`
- Modify: `tabs/library.tsx`,`types.ts`(加 DialogState)

- [ ] **Step 1: `types.ts` 加 `DialogState`**
`DialogState` 被 LibraryPage(dialog state)+ CollectionDialog 共用。Read library.tsx L24 的 `DialogState` 类型,迁到 `types.ts`:
```ts
// types.ts 加(引用现有 Collection 类型)
import type { Collection } from ...  // 若 types.ts 内已定义 Collection 则无需
export type DialogState =
  | { type: "create" }
  | { type: "assign" }
  | { type: "rename"; collection: Collection }
  | { type: "delete"; collection: Collection }
  | null
```
(以 library.tsx L24 实际定义为准逐字迁移;Collection 已在 types.ts)

- [ ] **Step 2: 创建 `components/CollectionDialog.tsx`**
Read L1519 的 `CollectionDialog`。新文件:
```tsx
// components/CollectionDialog.tsx — 收藏夹 dialog(从 tabs/library.tsx 迁出)
import { useEffect, useState } from "react"
import type { CSSProperties } from "react"
import type { Collection, DialogState } from "../types"
import { Icon } from "./Icon"

interface CollectionDialogProps {
  // ↓ 从 library.tsx CollectionDialog 签名(L1519 起)逐字迁移 ↓
}

export function CollectionDialog(props: CollectionDialogProps) {
  // ↓ 函数体逐字迁移(含内部 useState/useEffect) ↓
}
```

- [ ] **Step 3: 创建 `components/ExportHistoryModal.tsx`**
Read L1687 的 `ExportHistoryModal`:
```tsx
// components/ExportHistoryModal.tsx — 导出历史 modal(从 tabs/library.tsx 迁出)
import type { CSSProperties } from "react"
import type { ExportHistoryEntry } from "../types"
import { Icon } from "./Icon"

interface ExportHistoryModalProps {
  // ↓ 从 library.tsx ExportHistoryModal 签名(L1687 起)逐字迁移 ↓
}

export function ExportHistoryModal(props: ExportHistoryModalProps) {
  // ↓ 函数体逐字迁移 ↓
}
```

- [ ] **Step 4: `tabs/library.tsx` 加 import + 删定义**
- 加:`import { CollectionDialog } from "../components/CollectionDialog"` + `import { ExportHistoryModal } from "../components/ExportHistoryModal"` + `import type { DialogState } from "../types"`(若 library.tsx 用 DialogState 类型)
- 删:library.tsx 的 `CollectionDialog`(L1519)、`ExportHistoryModal`(L1687)、`DialogState`(L24,已迁 types.ts)

- [ ] **Step 5: 验证**
Run: `pnpm exec tsc --noEmit` → 0 错误
Run: `pnpm build` → DONE
Run: `pnpm test` → 47 passed

- [ ] **Step 6: Commit**
```bash
git add components/CollectionDialog.tsx components/ExportHistoryModal.tsx tabs/library.tsx types.ts
git commit -m "refactor: CollectionDialog/ExportHistoryModal 抽到 components(批2-3)"
```

- [ ] **Step 7: 手测 UI(用户验证)**
加载扩展,确认 dialog(创建/重命名/删除收藏夹)、导出历史 modal、网格卡/列表行、Toast 交互与拆分前一致。自动化覆盖不到这些交互回归。

---

## Self-Review(plan 写完后自检)

- **Spec 覆盖**:spec §4 的 6 组件 → Task 1(Icon+Toast)/Task 2(Cell+Row)/Task 3(Dialog+Modal)全覆盖 ✅。类型归属(IconName→Icon.tsx,Notice→Toast.tsx,DialogState→types.ts)§4 要求覆盖 ✅。
- **占位符**:各 Task 的 props 接口标"从 library.tsx 签名逐字迁移"+ 给定义行号,是**现有代码迁移指令**(非新代码 placeholder)。组件函数体同理(迁移,非新写)。实施者 Read 指定行号迁移。
- **类型一致**:`IconName`/`Notice`/`DialogState` 跨 Task 引用一致(Task 1 定义,Task 2/3 若用则 import);`DialogState` Task 3 迁 types.ts,CollectionDialog/ExportHistoryModal 从 `../types` import ✅。组件 `import { Icon } from "./Icon"` 路径一致(components/ 内)✅。
- **依赖顺序**:Task 1 先抽 Icon(被 Cell/Row/Dialog/Modal 依赖);Task 2/3 的组件 import Icon ✅。

---

## 后续

批 2 合并(或本分支继续)后,批 3(hooks 抽出)调 writing-plans 出 plan(基于 spec §5)。批 3 是最复杂的一批(state/useMemo 依赖链)。
