# M1 实施计划 — 弹窗密度改造（UI 重设计 第一里程碑）

> **For agentic workers:** REQUIRED SUB-SKILL: 用 `superpowers:executing-plans` 逐任务执行。步骤用 checkbox（`- [ ]`）跟踪。
> **依据设计文档：** `docs/superpowers/plans/2026-06-16-ui-redesign-asset-manager.md`（§4 规范、§3.4 数据看板、§1.4 密度目标）。

**Goal:** 把弹窗从"Hero 大卡 + 作者轮播消费型"改造为"高密度资产管理型"——首屏素材密度翻倍、新增数据条、弱化 Hero、强调色升级为更活泼的 `#0a84ff`、微交互对齐 Apple `scale(0.95)`，并为 M2 全屏素材库预留入口。

**Scope（M1 边界）：** **纯前端、纯弹窗**。不改数据模型、不改 background、不改采集/下载链路、不新增消息类型、不动 MAIN-world 注入。收藏夹 / 分文件夹导出 / 全屏库页留待 M2–M4。

**Architecture:** 改动集中在 `lib/design-tokens.ts`（强调色 token）、`popup.tsx`（数据条 + 网格密度 + 库入口）、`components/StatCard.tsx`（新增）、`components/Hero.tsx`（紧凑模式）、`components/MediaCard.tsx` & `components/FloatBar.tsx`（微交互对齐）。全部经 `theme.*` 消费，无内联 magic value。

**Tech Stack:** Plasmo 0.90.5 · React 18 · TS 5 · MV3。inline `React.CSSProperties` + `useTheme()`。

**分支：** 沿用当前 `chore/p3-a11y-audit-20260616` 之外**另开新分支** `feat/m1-popup-density-20260616`（遵循项目分支工作流：带日期后缀、不在 main 改、commit 用中文、**改完等用户验收再 commit**）。

---

## 验证基线（每个 Task 末尾通用）

- **类型检查：** `cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo && npx tsc --noEmit`
  - 预期：除 `lib/base.ts(146)` 既有遗留错误（`baseVal`，死代码区，与本计划无关）外**无新增错误**。
- **构建：** `npx plasmo build 2>&1 | tail -15` → 成功。
- **人工验证：** `chrome://extensions` 重新加载 `build/chrome-mv3-dev` → 打开弹窗肉眼核对。
- **提交时机：** 所有 Task 完成、`tsc`+`build` 通过、**用户在 Chrome 验收通过后**统一提交（见 Task 8）。中途不提交。

---

## Task 0: 创建工作分支

- [ ] **Step 1: 从 main 拉新分支**

```bash
cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo
git stash list   # 确认无遗漏;当前 a11y 改动若已 commit 则忽略
git checkout main
git pull --ff-only
git checkout -b feat/m1-popup-density-20260616
```

> 若当前 `chore/p3-a11y-audit-20260616` 分支有**未提交且需保留**的改动，先与用户确认如何处置（commit / stash），再切分支。不要丢弃用户的工作。

---

## Task 1: 强调色升级 `#0066cc → #0a84ff`（受控偏离）

**Files:** Modify `lib/design-tokens.ts`

设计依据：§4 受控偏离——保留**单一**强调色，仅取值上调为更活泼的系统蓝。改 token 后全组件经 `theme.accent` 自动生效。

- [ ] **Step 1: 改 `darkTheme` 强调色**

在 `lib/design-tokens.ts` 的 `darkTheme` 中：
```ts
// 改前
accent: "#0066cc",
accentFocus: "#0071e3",
// 改后
accent: "#0a84ff",        // 受控偏离:更活泼的系统蓝(产品决策,见设计文档 §4)
accentFocus: "#409cff",   // focus 态再亮一档
```
`accentDark` / `accentLight` 暗面辅助色维持不变（仍协调）。

- [ ] **Step 2: 改 `lightTheme` 强调色**

```ts
// 改前
accent: "#0066cc",
accentFocus: "#0071e3",
// 改后
accent: "#0a84ff",
accentFocus: "#0071e3",   // 亮底保留稍深 focus,保证对比
```
> 注意：`lightTheme.accentDark: "#0058a6"`（亮底深色文字版）保持不变——它用于浅色背景上需要足够暗的链接文字。

- [ ] **Step 3: 同步 focus ring token**

`focusRing` / `focusRingOffset` 当前硬编码了 `#0066cc` 与 `rgba(0,102,204,...)`。两个主题都更新为新色：
```ts
focusRing: "0 0 0 2px #0a84ff",
focusRingOffset: "0 0 0 2px #0a84ff, 0 0 0 4px rgba(10,132,255,0.25)",
```

- [ ] **Step 4: 同步 popup.tsx 内联的 focus ring 颜色**

`popup.tsx` `injectPopupStyles()` 里 `:focus-visible` 与 `button:focus-visible` 硬编码了 `rgba(0,102,204,0.3)`。改为 `rgba(10,132,255,0.3)`，并确认 `outline`/`box-shadow` 用 `${theme.accent}`（已是变量则无需改色值，只改那处 rgba 常量）。

- [ ] **Step 5: 全局排查残留旧色**

```bash
grep -rn "#0066cc\|0,102,204" components/ popup.tsx lib/ | grep -v design-tokens.ts
```
预期：无残留（design-tokens.ts 自身已改）。若有命中，逐个替换为 `theme.accent` 或新 rgba。

- [ ] **Step 6: 验证** — 跑通用验证基线（`tsc` 无新增错误 + `build` 成功）。

---

## Task 2: 新增 `StatCard` 组件（数据看板卡）

**Files:** Create `components/StatCard.tsx`

设计依据：§3.4 数据看板。弹窗用 3 卡（今日采集 / 总量 / 作者）。组件做成通用卡，库页（M2）复用。

- [ ] **Step 1: 创建 `components/StatCard.tsx`**

```tsx
// components/StatCard.tsx — 数据看板卡(弹窗 + 库页共用)
import { useTheme } from "../lib/use-theme"
import type { ThemeTokens } from "../lib/design-tokens"

interface StatCardProps {
  /** 主数字(已格式化的字符串,如 "12" / "128") */
  value: string
  /** 数字后缀单位(如 "项" / "位") */
  unit?: string
  /** 卡片标签 */
  label: string
  /** 副信息(如 "↑ 较昨日 +50%" 或 "图 96 · 视频 32") */
  hint?: string
  /** 主数字是否用强调色(用于"今日采集"等正向数据) */
  highlight?: boolean
}

export function StatCard({ value, unit, label, hint, highlight }: StatCardProps) {
  const theme = useTheme()
  const styles = makeStyles(theme)
  return (
    <div style={styles.card}>
      <div style={{ ...styles.value, ...(highlight ? { color: theme.accent } : {}) }}>
        {value}
        {unit && <span style={styles.unit}>{unit}</span>}
      </div>
      <div style={styles.label}>{label}</div>
      {hint && <div style={styles.hint}>{hint}</div>}
    </div>
  )
}

const makeStyles = (theme: ThemeTokens): Record<string, React.CSSProperties> => ({
  card: {
    flex: 1,
    minWidth: 0,
    background: theme.card,
    borderRadius: theme.r.md,
    padding: `${theme.sp.sm}px ${theme.sp.sm + 2}px`,
  },
  value: {
    fontSize: theme.fs.title + 2, // 19px,密集但醒目
    fontWeight: 700,
    letterSpacing: "-0.3px",
    lineHeight: 1.1,
    color: theme.textPrimary,
  },
  unit: {
    fontSize: theme.fs.caption,
    fontWeight: 500,
    color: theme.textTertiary,
    marginLeft: 2,
  },
  label: {
    fontSize: theme.fs.micro,
    color: theme.textTertiary,
    marginTop: 3,
  },
  hint: {
    fontSize: theme.fs.micro,
    color: theme.textSecondary,
    marginTop: 2,
  },
})
```

- [ ] **Step 2: 验证** — `npx tsc --noEmit`（StatCard 自身无类型错误）。

---

## Task 3: popup.tsx 接入数据条（3 卡聚合）

**Files:** Modify `popup.tsx`

设计依据：§3.4——看板由前端 `useMemo` 从 `items` 聚合，**不加后台负担**。

- [ ] **Step 1: import StatCard**

```ts
import { StatCard } from "./components/StatCard"
```

- [ ] **Step 2: 新增聚合 useMemo（放在现有 `authors` useMemo 之后）**

```ts
// 数据看板聚合(§3.4):今日采集数 / 图视分布 / 作者数。纯前端,基于已有 items。
const stats = useMemo(() => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let today = 0, imgCount = 0, videoCount = 0
  for (const it of items) {
    if (new Date(it.collectedAt).getTime() >= todayStart) today++
    if (it.type === "video") videoCount++; else imgCount++
  }
  const authorCount = authors.filter((a) => a.name).length // 排除"未分类"空作者
  return { today, total: items.length, imgCount, videoCount, authorCount }
}, [items, authors])
```

- [ ] **Step 3: 在顶栏（navbar）与筛选区之间插入数据条 JSX**

定位：紧跟 `</div>`（navbar 结束）之后、`{searchOpen && (...)}` 之前。仅在**非搜索态**显示（搜索时聚焦结果，收起看板，与现有筛选行折叠逻辑一致）：

```tsx
{!searchOpen && (
  <div style={styles.statsRow}>
    <StatCard value={String(stats.today)} unit="项" label="今日采集" highlight={stats.today > 0} />
    <StatCard value={String(stats.total)} unit="项" label="素材总量" hint={`图 ${stats.imgCount} · 视频 ${stats.videoCount}`} />
    <StatCard value={String(stats.authorCount)} unit="位" label="关注作者" />
  </div>
)}
```

- [ ] **Step 4: 加 `statsRow` 样式**（在 `makeStyles` 内）

```ts
statsRow: {
  display: "flex",
  gap: theme.sp.xs,
  padding: `0 ${theme.sp.md}px ${theme.sp.sm}px`,
},
```

- [ ] **Step 5: 验证** — 通用基线 + 肉眼确认弹窗顶部出现 3 张数据卡。

---

## Task 4: Hero 弱化为紧凑模式

**Files:** Modify `components/Hero.tsx`, `popup.tsx`

设计依据：§1.3——Hero 占首屏太多，弱化以提升密度，但保留"最新采集 + 快速下载/原帖"快捷价值。

- [ ] **Step 1: Hero 加 `compact` prop**

`components/Hero.tsx` props 增加：
```ts
interface HeroProps {
  // …现有…
  /** M1:紧凑模式——降低高度,让位给密集网格 */
  compact?: boolean
}
```
在 `makeStyles` 的 `hero` 样式里，把固定 `maxHeight` 从 180 降到紧凑值。改为根据 compact 切换（在组件内 inline 合并）：
```tsx
<div style={{ ...styles.hero, ...(compact ? { maxHeight: 132 } : {}) }} ...>
```
> 仅调高度上限，封面 16:9 比例与快速操作（下载/原帖）逻辑全部不变。

- [ ] **Step 2: popup.tsx 传 `compact`**

在 `<Hero ... />` 调用加 `compact`：
```tsx
<Hero
  item={heroItem}
  count={heroImageCount ?? 1}
  compact
  onClick={() => openPreview(heroItem!)}
  // …onDownload / onOpenSource 不变…
/>
```

- [ ] **Step 3: 验证** — 通用基线 + 肉眼确认 Hero 变矮、网格上移、首屏能看到更多素材。

---

## Task 5: 网格密度提升到 4 列

**Files:** Modify `popup.tsx`

设计依据：§1.4 目标 1——首屏密度翻倍。当前 `gridWrap` 是 `minmax(120px,1fr)`（460px 宽下约 3 列），降到 `100px` 得到 4 列。

- [ ] **Step 1: 改 `gridWrap` 列宽 + 间距**

`popup.tsx` `makeStyles`：
```ts
// 改前
gridWrap: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
  gap: theme.sp.sm,
},
// 改后(4 列密集网格)
gridWrap: {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: theme.sp.xs + 2, // 10px,密集但不拥挤
},
```
> 用固定 `repeat(4, 1fr)` 而非 auto-fill：弹窗宽度固定 460px，4 列是确定值，避免 auto-fill 在边界宽度跳列。

- [ ] **Step 2: 收紧网格分节间距（可选微调）**

`gridSection` 底部内边距由 `sp.sm+2` 略收，给密集网格让空间（视觉确认后定，若已协调可跳过）。

- [ ] **Step 3: 验证** — 通用基线 + 肉眼确认每行 4 个素材卡、对齐整齐、`MediaCard` 标题/作者不溢出。

---

## Task 6: 顶栏新增"打开素材库"入口（M1 占位）

**Files:** Modify `popup.tsx`

设计依据：§2.1 / §6——弹窗 `↗` 进全屏库。M1 库页尚未实现，**本步只放按钮 + 友好提示**，M2 接真实跳转。

- [ ] **Step 1: 在 `tools` 区（主题/搜索按钮所在）新增库入口按钮**

放在主题按钮之前或搜索按钮之后（视觉权重靠右）。复用 `styles.tool` 容器：
```tsx
<div
  style={styles.tool}
  role="button"
  tabIndex={0}
  aria-label="打开素材库(即将上线)"
  title="素材库(M2 上线)"
  onClick={openLibrary}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLibrary() } }}
>
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M15 3h6v6M21 3l-9 9" />
    <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
  </svg>
</div>
```

- [ ] **Step 2: 加 `openLibrary` 占位处理（M1）**

```ts
// M1 占位:全屏素材库在 M2 上线。此处先用 Toast 友好提示,避免死按钮。
const openLibrary = () => {
  setDownloadError("素材库即将上线,敬请期待 ✨") // 复用现有 Toast 通道(非错误语义,仅提示)
}
```
> 复用现有 `downloadError` Toast 通道做轻提示即可；M2 改为 `chrome.tabs.create({ url: chrome.runtime.getURL("tabs/library.html") })`。实施时如觉得复用错误通道语义别扭，可在该步用一个独立的 `infoToast` 状态——二选一，保持简单。

- [ ] **Step 3: 验证** — 通用基线 + 点击按钮出现"即将上线"提示、键盘可聚焦激活。

---

## Task 7: 微交互对齐 Apple `scale(0.95)`

**Files:** Modify `popup.tsx`（注入样式）、`components/MediaCard.tsx`、`components/FloatBar.tsx`、`lib/xhs-detail-collector.ts`（可选）

设计依据：§4 铁律 #6——所有按钮 active 统一 `scale(0.95)`，替换现有 `0.96/0.97/1.05` 等杂值。

- [ ] **Step 1: popup.tsx `.mc-card-art:active` 对齐**

`injectPopupStyles()` 内：
```css
/* 改前 */ .mc-card-art:active { transform: scale(0.97); }
/* 改后 */ .mc-card-art:active { transform: scale(0.95); }
```
hover 的 `translateY(-2px) scale(1.02)` 保留（这是提升态，非 press 态）。

- [ ] **Step 2: 排查并统一其余 active scale**

```bash
grep -rn "scale(0\.9" components/ popup.tsx lib/
```
把按钮 **press/active** 态的 `scale(0.96)` / `scale(0.97)` 统一为 `scale(0.95)`。
> 注意区分：`:hover` 的放大态（如详情页采集按钮 `scale(1.05)`）**不属于** press 态，不改。只改 `:active` / press。

- [ ] **Step 3: 验证** — 通用基线 + 肉眼确认按下卡片/按钮有一致的轻微缩小回弹。

---

## Task 8: 端到端验证、文档同步、提交

- [ ] **Step 1: 全量验证**

```bash
cd /Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo
npx tsc --noEmit            # 仅剩 lib/base.ts(146) 既有遗留错误
npx plasmo build 2>&1 | tail -15   # 成功
```

- [ ] **Step 2: 人工验收清单（在 Chrome 加载 dev 包后逐项确认）**
  - 数据条 3 卡显示且数字正确（今日/总量/图视分布/作者数）
  - 网格每行 4 个、对齐、标题不溢出
  - Hero 变矮、首屏密度明显提升
  - 强调色变为更活泼的 `#0a84ff`（选中圈、focus ring、主题/库按钮激活态）
  - 氛围光仍在（背景底层）
  - "打开素材库"按钮出现并给出"即将上线"提示
  - 按钮/卡片按下 `scale(0.95)` 回弹一致
  - 亮色主题切换无异常（强调色、对比度 OK）
  - 键盘 Tab 焦点环可见且为新色

- [ ] **Step 3: 同步文档（轻量，M1 范围）**
  - 在设计文档里勾掉 M1 里程碑（§8）。
  - `LESSONS.md` 追加一条：强调色受控偏离 `#0066cc→#0a84ff` 的决策与理由。
  - （`CLAUDE.md`/`AGENTS.md` 的"数据条/库入口"等结构性更新留到 M2 一并改，避免半成品文档。）

- [ ] **Step 4: ⚠️ 等用户验收通过后提交（遵循项目分支工作流）**

> **不要在用户确认前 commit。** 用户在 Chrome 验收通过后，再执行：

```bash
git add lib/design-tokens.ts popup.tsx components/StatCard.tsx components/Hero.tsx components/MediaCard.tsx components/FloatBar.tsx
git add docs/superpowers/plans/ LESSONS.md
git commit -m "feat(m1): 弹窗密度改造 — 数据条 + 4列网格 + Hero 弱化 + 强调色升级 #0a84ff + 库入口占位"
```

---

## 任务依赖关系

```
Task 0 (分支)
  └─ Task 1 (强调色 token) ──────────────┐
  └─ Task 2 (StatCard 组件) ── Task 3 (popup 接数据条)
  └─ Task 4 (Hero 紧凑) ─┐
  └─ Task 5 (4列网格) ───┼─ 互相独立,可并行编辑
  └─ Task 6 (库入口占位)─┘
  └─ Task 7 (scale 0.95) ─┘
                          └─ Task 8 (验证+文档+提交) ← 所有完成后
```

Task 1–7 之间无强依赖（改动文件基本不重叠；Task 3 依赖 Task 2 的组件存在）。建议顺序执行便于逐步肉眼验证。

---

## Self-Review

**1. 范围正确性**
- ✅ 纯前端、纯弹窗，无数据模型 / background / 采集下载 / MAIN-world 改动
- ✅ 收藏夹/分文件夹导出/库页正确推迟到 M2–M4
- ✅ 库入口做占位而非半截真实跳转（避免死按钮 + 避免引入未完成的 tabs 路由）

**2. 规范一致性**
- ✅ 强调色受控偏离已与设计文档 §4 对齐（保留单一强调色精神）
- ✅ 氛围光仅底层保留；前景无装饰渐变
- ✅ `scale(0.95)` 统一；圆角用 `theme.r.*`；新组件无内联 magic value，全经 `theme.*`

**3. 与现有代码一致**
- ✅ 复用现有 Toast 通道做库入口提示（不新增机制）
- ✅ 数据条聚合复用已有 `items`/`authors`，零后台负担
- ✅ 网格用固定 4 列（弹窗宽度固定，避免 auto-fill 跳列）
- ✅ 强调色改 token 单点生效，全组件 `theme.accent` 自动跟随

**4. 流程合规**
- ✅ 新分支带日期后缀、不在 main 改、commit 中文
- ✅ **改完等用户验收再 commit**（项目硬约束）
- ✅ 每 Task 有验证；Task 8 有完整人工验收清单

**5. 占位符扫描**
- ✅ 无 TBD；每步含可执行代码/命令
- ⚠️ Task 6 库入口为**有意占位**（M2 替换为真实跳转），已显式标注，非遗漏
