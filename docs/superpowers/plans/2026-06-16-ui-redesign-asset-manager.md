# 素材采集助手 — UI 重设计 设计文档（v3.0）

> **类型:** 设计文档（Design Doc)。本文定义"设计什么、为什么、规范是什么"，是后续 **实施计划**（另立 `*-implementation.md`）的输入依据。
> **For agentic workers:** 本文不含逐步 checkbox。落地时按本文产出 superpowers 实施计划，再用 `superpowers:executing-plans` 执行。

**Goal:** 把当前"Apple Music 沉浸消费型"弹窗，重构为面向**自媒体从业者**的**效率优先素材资产管理台**——弹窗负责"采完即用"的快速处理，新增**全屏素材库页**负责"做选题时翻历史素材"的完整管理。核心是把采集到的素材高效转化为**可用的本地素材库**。

**Architecture:** 双视图。① **弹窗**（460×660，复用现有 `popup.tsx`，密度提升 + 数据条 + 库入口）；② **全屏素材库**（新增 `tabs/library.tsx`，独立标签页，左侧栏导航 + 数据看板 + 密集网格 + 批量条）。两者共享 `lib/design-tokens.ts`、`components/`、`background` 数据层。新增 **收藏夹（collections）** 数据维度与 **分文件夹导出** 能力。

**Tech Stack:** Plasmo 0.90.5, React 18, TypeScript 5, Chrome Extension Manifest V3。延续：inline `React.CSSProperties`、`useTheme()` token 消费、background 消息路由 + `enqueueWrite` 串行存储。

**Design System:** Apple Liquid Glass（`.agents/skills/apple-liquid-glass`），暗色为主、亮色跟随。**严格遵守 10 条铁律**（见 §4）。

---

## 1. 用户与场景分析（为什么这样设计）

### 1.1 目标用户
付费的**自媒体内容从业者**（小红书/抖音博主、运营、MCN 助理）。他们用本插件不是为了"欣赏"素材，而是为了**生产内容**。素材对他们是**生产资料**，不是消费内容。

### 1.2 真实工作流（4 个高频环节）

| 环节 | 场景 | 对 UI 的要求 |
|---|---|---|
| **A. 批量囤素材** | 刷信息流找对标/灵感，看到好的就采，一次会话采几十上百条 | 采集动作本身在页面内完成（已具备）；弹窗要能**高密度**回看 |
| **B. 找回素材** | 几天后做选题时，要快速找到"上次那个穿搭博主的图" | **搜索 + 多维筛选 + 按主题归类** 是刚需，素材越多越关键 |
| **C. 批量导出** | 选一批，一键下载到本地素材库，最好**按选题/作者分文件夹** | 批量导出是**主操作**，路径要最短、最显眼 |
| **D. 管理素材** | 删用过的、重复的；把素材归入选题分组 | 批量删除 + **收藏夹归类** + 撤销 |

### 1.3 当前设计的核心矛盾
现有弹窗是 **Hero 大卡 + 作者轮播 + 时间分节** 的"消费型"布局——视觉漂亮，但：
- **密度低**：Hero 占掉首屏一半，一屏看不到几个素材，与"囤了上百条"的现实冲突。
- **组织维度错位**：以"作者/时间"为主轴，但从业者是按"**选题主题**"找素材的（"618 选题"而非"@某某 的图"）。
- **批量不是主角**：批量操作藏在浮动栏，而它恰恰是付费用户的核心诉求。

### 1.4 设计目标（可度量）
1. **首屏素材密度 ≥ 翻倍**（弹窗 4 列网格；库页自适应 ≥5 列）。
2. **找回任意历史素材 ≤ 3 步**（搜索框 / 收藏夹 / 平台筛选任一路径）。
3. **批量导出 ≤ 2 步**（选中 → 导出，导出主按钮永远高亮可见）。
4. **付费价值可感知**：收藏夹、分文件夹导出、数据看板——让用户"感到自己在高效产出"。

---

## 2. 信息架构

### 2.1 双视图分工

```
┌─ 弹窗 popup.tsx (460×660) ──────────┐    ┌─ 全屏素材库 tabs/library.tsx ───────────────┐
│ "采完即用 · 快速处理"                │    │ "做选题 · 完整管理"                          │
│                                     │    │                                              │
│ 顶栏: logo+标题+数量  [搜][主题][↗库]│    │ 左侧栏          │  工具栏(大搜索+排序+视图)   │
│ 数据条: 今日/总量/作者 (3 卡)        │    │  · 全部素材     │  数据看板 (4 卡)            │
│ 筛选行: 平台chip + 图/视频 segmented │    │  · 最近采集     │  ───────────────────────── │
│ 时间分节 + 4列密集网格               │    │  · 未分类       │  筛选chip + 批量操作条      │
│ 选中 → 底部玻璃浮动栏(全选/导出/删)  │    │  ─ 我的收藏夹 ─ │  ───────────────────────── │
│ [↗] 打开完整素材库 ─────────────────┼───▶│  · 618选题      │  时间分节 + 自适应密集网格   │
└─────────────────────────────────────┘    │  · 穿搭对标 …   │  (hover 出 下载/原帖 微操作) │
                                            │  ─ 平台 ─       │                              │
                                            │  · 小红书/抖音  │  导出成功 Toast(打开文件夹)  │
                                            │  ─ 升级 Pro ─   │                              │
                                            └────────────────┴──────────────────────────────┘
```

### 2.2 导航主轴的转变
- **旧主轴**：作者（轮播）→ 时间（分节）。
- **新主轴（库页）**：**收藏夹/主题**（左侧栏，用户自建）为第一导航；平台、类型、时间、作者降级为**筛选维度**。
- **弹窗保留时间分节**（弹窗是"最近采集"语境，时间天然合适），但密度大幅提升。

### 2.3 原型对照
- 弹窗：`mockups/redesign-popup.html`
- 库页：`mockups/redesign-library.html`

---

## 3. 四大效率功能设计

### 3.1 强力搜索与筛选
- **搜索**：库页顶部大搜索框（`⌘K` 聚焦），匹配 `title` + `author`（复用现有 `filteredItems` 逻辑）。弹窗保留图标触发的搜索。
- **筛选维度**：平台（chip，品牌色）、类型（图/视频 segmented）、收藏夹（左侧栏）、时间（分节）、作者（chip / 点击头像）。
- **筛选可叠加**，且**激活态可一键清除**（chip 带 `×`）。
- 规范：chip 用 `pill` 圆角；激活态平台 chip 用平台品牌色（小红书 `#FF2442`、抖音 `#25F4EE`），其余用 Action Blue `#0066cc`。

### 3.2 批量导出增强（付费核心）
- **批量条**始终承载主操作：`导出 N 项`（Action Blue 实心，唯一高亮主按钮）+ `加入收藏夹` + `删除`。
- **分文件夹导出**：导出时按目标自动建子目录，路径为
  `MEDIA_COLLECTOR_DIR / <收藏夹名 或 作者名 或 "未分类"> / <文件名>`。
  - 这是把"采集"变"可用素材库"的关键一步，也是 Pro 卖点之一。
- **导出反馈**：成功 Toast 显示"已导出 N 项到 `素材库/618选题/`"+ `打开文件夹` 链接（`chrome.downloads.show` / `showDefaultFolder`）。
- 复用现有 `BATCH_DOWNLOAD` 链路（`background/download.ts` `fetchAndDownload`，带 Referer 绕防盗链、data URL、300ms 间隔），仅**扩展 filename 前缀**支持子目录。

### 3.3 素材分组 / 收藏夹
- 用户可自建收藏夹（如 `618选题`/`穿搭对标`），带名称 + 颜色圆点。
- 一条素材可属于 **0..N 个收藏夹**（多对多，用 id 数组）。
- 左侧栏列出收藏夹 + 计数；点击即筛选。
- 入口：批量条"加入收藏夹"、卡片右键 / hover 菜单（实施期细化）。
- **数据模型影响见 §5**。

### 3.4 采集数据看板
- 弹窗 3 卡：今日采集（带环比）/ 素材总量（图·视频分布）/ 关注作者数。
- 库页 4 卡：今日采集 / 素材总量 / 关注作者（Top 作者）/ 本周已导出。
- 全部由**前端 `useMemo` 从 `items` 聚合**，无需后台改动（"本周已导出"需记录导出时间，见 §5 可选项）。
- 作用：给从业者**产出效能正反馈**，是付费工具的留存钩子。**纯展示，不可成为性能负担**（聚合在已有 `items` 上做）。

---

## 4. Apple Liquid Glass 设计规范对齐（铁律自检）

> ⚠️ **规范裁决（已由产品决策更新）**：原型使用 `#0a84ff`（更通透活泼的系统蓝）+ 低透明度散景氛围光。**产品决定保留这两项作为有意的品牌偏离**——目标用户是自媒体从业者，"更活泼、有氛围"符合调性。因此 §4 对铁律 #1（单一强调色）和 #8（无装饰渐变）做**受控偏离**，其余 8 条铁律严格遵守。

**两处有意偏离的边界（不可扩散）：**
- **强调色改为 `#0a84ff`**：仍是**单一**强调色——所有交互/选中/focus/主 CTA 统一用它，**绝不引入第三个强调色**。铁律"唯一强调色"的精神保留，只是取值从 `#0066cc` 升到 `#0a84ff`。落地方式：改 `lib/design-tokens.ts` 的 `accent`，全组件经 `theme.accent` 自动生效。
- **保留氛围光**：仅用现有 `theme.ambient`（已是低透明度 radial-gradient）作**背景底氛围**，**不在卡片/按钮/前景控件上加任何装饰渐变**。氛围只在最底层。

| # | 铁律 | 本设计的执行 |
|---|---|---|
| 1 | ~~单一强调色 `#0066cc`~~ → **单一强调色 `#0a84ff`（受控偏离）** | 所有交互/选中/focus/主 CTA 用 `theme.accent`(=`#0a84ff`)。**仍是唯一强调色**，平台品牌色（`xhs`/`douyin`）仅用于平台标识 chip/角标。 |
| 2 | **字重无 500** | 仅 `400/600/700`。正文 400、强调/标题 600、超大标题 700 谨慎用。全局排查现有组件，禁用 `fontWeight:500`。 |
| 3 | **正文 17px** | 正文用 `theme.fs.title`(17) 作阅读字号；密集网格元信息可用 `fs.caption`(12)/`fs.micro`(11)。 |
| 4 | **卡片/按钮无阴影** | 层次靠表面色变化 + `hairline`。**唯一例外**：浮动玻璃栏 / Hero 封面图可用既有 `shadowFloat`/`shadowHero`（漂浮在内容上的表面，符合"产品图/浮层"语义）。普通网格卡 hover 的 `shadowCard` 属克制提升，保留但收敛。 |
| 5 | **大标题负字距** | ≥17px 标题加 `letter-spacing: -0.2~-0.4px`。 |
| 6 | **微交互 `scale(0.95)`** | 所有按钮 active 用 `transform: scale(0.95)`（统一现有 `scale(0.96/0.97)` 为 `0.95`）。 |
| 7 | **四档圆角** | 仅 `theme.r.sm(8)/md(11)/lg(18)/pill`（外加既有 `xs(5)`）。**库页卡片统一 `r.md(11)`**，不用原型的 16px。 |
| 8 | ~~无装饰性渐变~~ → **氛围光限底层（受控偏离）** | 保留 `theme.ambient` 作背景底氛围（低透明度 radial-gradient）。**前景的卡片/按钮/chip 一律无装饰渐变**，氛围只在最底层。 |
| 9 | **行高分级** | 标题 1.07–1.19、正文 1.47。 |
| 10 | **近黑非纯黑** | 暗面已用 `#0a0a0c`/`#1c1c1e`；亮面文字 `#1d1d1f`。维持。 |

**Liquid Glass 材质**：浮动批量栏、库页 sticky 工具栏用
`background: theme.floatBar; backdrop-filter: theme.glassBlurStrong (saturate(180%) blur(30px))`，0.5px 高光边。`saturate(180%)` 不可省。

---

## 5. 数据模型影响

### 5.1 新增 `Collection`（收藏夹）
```ts
// types.ts 新增
export interface Collection {
  id: string
  name: string
  color: string        // 圆点色,取自 avatarGradients 同源调色板
  createdAt: string
}
export const COLLECTIONS_KEY = "collections"   // chrome.storage.local 独立键
```

### 5.2 `MediaItem` 扩展
```ts
export interface MediaItem {
  // …现有字段不变…
  collectionIds?: string[]   // 所属收藏夹(多对多);缺省=未分类
  exportedAt?: string        // 可选:最近导出时间,用于"本周已导出"看板
}
```
- `collectionIds` 缺省/空数组 = "未分类"，库页左侧栏"未分类"据此聚合。
- 向后兼容：旧数据无此字段，读取按"未分类"处理，**不需要数据迁移**。

### 5.3 新增消息类型（`MessageType` + `MessagePayloads` 同步更新）
| 消息 | 载荷 | 后台动作 |
|---|---|---|
| `GET_COLLECTIONS` | void | 读 `COLLECTIONS_KEY` |
| `CREATE_COLLECTION` | `{ name; color }` | 追加（`enqueueWrite` 串行） |
| `RENAME_COLLECTION` | `{ id; name }` | 改名 |
| `DELETE_COLLECTION` | `{ id }` | 删收藏夹 + 清理 items 的 `collectionIds` |
| `ASSIGN_COLLECTION` | `{ itemIds: string[]; collectionId }` | 给一批素材打标 |
| `UNASSIGN_COLLECTION` | `{ itemIds; collectionId }` | 取消标 |

> 约束：所有写操作走 `enqueueWrite()`（`background/storage.ts`），不得绕过。新增 `background/collections.ts` 模块承载 CRUD，`index.ts` switch 路由按现有范式 `as MessagePayloads["..."]` 收窄。

### 5.4 导出路径扩展
- `BATCH_DOWNLOAD` 载荷的 `filename` 已是相对路径；扩展为带子目录前缀即可，`fetchAndDownload` 无需改造（`chrome.downloads` 支持 `子目录/文件名`）。
- 子目录名做非法字符清洗（复用 `buildFilename` 的 `replace(/[/\\?%*:|"<>]/g,"-")`）。

---

## 6. 新增页面：全屏素材库（`tabs/library.tsx`）

- **Plasmo `tabs/` 路由**：`tabs/library.html` + `tabs/library.tsx` 自动注册为扩展页面，URL `chrome-extension://<id>/tabs/library.html`。
- **打开入口**：弹窗顶栏 `↗` 按钮 → `chrome.tabs.create({ url: chrome.runtime.getURL("tabs/library.html") })`。
- **布局**：见 §2.1。左侧栏固定 248px；主区工具栏 + 看板 + 批量条 + 滚动网格。
- **复用**：`MediaCard`（需支持库页更大尺寸 + hover 微操作）、`PreviewModal`、`Toast`、`useTheme`、所有聚合 `useMemo`。
- **网格**：`grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))` 自适应列数，随窗口宽度增减。
- **Pro 升级位**：左下角，付费转化入口（功能门控策略在商业化文档另定，本文只占位）。

---

## 7. 组件清单（改动面）

| 组件 | 动作 | 说明 |
|---|---|---|
| `lib/design-tokens.ts` | 改 | 对齐铁律自检；新增收藏夹色板引用（复用 `avatarGradients`）；移除/收敛装饰渐变。 |
| `types.ts` | 改 | `Collection`、`MediaItem.collectionIds/exportedAt`、新消息类型与载荷。 |
| `background/collections.ts` | **新增** | 收藏夹 CRUD + 打标（`enqueueWrite`）。 |
| `background/index.ts` | 改 | 路由新增 6 个消息。 |
| `background/download.ts` | 改 | filename 支持子目录前缀（分文件夹导出）。 |
| `popup.tsx` | 改 | 数据条；密度提升（弱化 Hero / 4 列网格）；顶栏加 `↗库` 入口；批量条主操作高亮。 |
| `tabs/library.tsx` + `tabs/library.html` | **新增** | 全屏素材库页（左侧栏 + 看板 + 网格 + 批量）。 |
| `components/Sidebar.tsx` | **新增** | 库页左侧栏（导航 + 收藏夹列表 + Pro 位）。 |
| `components/StatCard.tsx` | **新增** | 数据看板卡（弹窗 + 库页共用）。 |
| `components/MediaCard.tsx` | 改 | 支持库页更大尺寸 + hover 出 下载/原帖 微操作 + 选中态对齐铁律（`2px` Action Blue ring，不改背景不加阴影）。 |
| `components/FloatBar.tsx` | 改 | 批量条加"加入收藏夹"动作；主操作"导出"恒高亮。 |
| `components/CollectionDialog.tsx` | **新增** | 新建/重命名收藏夹 + "加入收藏夹"选择面板。 |
| `components/Hero.tsx` / `AuthorCarousel.tsx` | 评估 | 弹窗密度方案下，Hero 缩小或降级；作者轮播降为筛选入口（实施期定）。 |

---

## 8. 范围与里程碑（建议落地顺序）

> 详细 checkbox 步骤在实施计划中展开；此处仅定阶段，便于分批验证、每阶段可独立交付。

- **M1 弹窗密度改造**（无数据模型改动，纯前端）：数据条 + 4 列密集网格 + `↗库` 入口 + 铁律对齐。**先交付、风险最低**。
- **M2 全屏素材库骨架**：`tabs/library.tsx` + 侧栏 + 看板 + 网格（先不含收藏夹写操作，仅"全部/最近/未分类/平台"导航）。
- **M3 收藏夹能力**：数据模型 + 6 消息 + `background/collections.ts` + 加入收藏夹 + 左侧栏自建。
- **M4 分文件夹导出 + 导出反馈 Toast**。
- **M5 打磨**：动效（`easeSpring`/`scale(0.95)`）、空状态、键盘可达性、亮色主题校验、a11y 复检。

每个里程碑结束：`npx tsc --noEmit` 通过 + `npx plasmo build` 通过 + 人工在 Chrome 加载验证 + **等用户验收后再 commit**（遵循项目分支工作流）。

---

## 9. 风险与约束

1. **XHS 采集稳定性**（既有命门）：本次重设计不触碰 MAIN-world 注入链路（`lib/xhs-state-inject.ts` 等），不引入新风险，但素材库的价值依赖采集持续可用。
2. **存储体量**：素材多（图集×多图）时 `chrome.storage.local` 有 ~10MB 上限；看板/库页要避免一次性渲染全部 DOM（虚拟滚动列入 M5 评估）。
3. **不破坏的硬约束**（来自 CLAUDE.md）：`stateInjector` 自包含、`xiaohongshu.ts` 保持 `document_start`、所有写入走 `enqueueWrite`、下载走 SW `fetchAndDownload`、下载目录用 `MEDIA_COLLECTOR_DIR` 常量。
4. **规范一致性**：所有新组件**禁止内联 magic value**，一律消费 `theme.*`；禁止 `fontWeight:500`；圆角不用四档之外的值。
5. **付费门控**：Pro 功能边界（哪些免费、哪些付费）属商业化决策，本设计文档**只预留入口与数据结构**，不锁定策略。

---

## 10. 文档同步要求

落地后需同步更新（CLAUDE.md 既有约定，曾因漂移踩坑）：
- `CLAUDE.md` / `AGENTS.md` —— 新增"全屏素材库"视图、收藏夹数据模型、新消息类型；修正残留的 `popup-theme.ts` → `lib/design-tokens.ts`。
- `README.md` —— 文件树新增 `tabs/`、`components/Sidebar.tsx` 等。
- `DESIGN.md` / `LESSONS.md` —— 记录"从消费型到资产管理型"的设计转向与理由。

---

## Self-Review

**1. 需求覆盖**
- ✅ 效率优先资产管理台（§1.3/§2 主轴转向）
- ✅ 弹窗 + 独立管理页（§2.1/§6）
- ✅ 四大效率功能：批量导出增强（§3.2）/ 搜索筛选（§3.1）/ 收藏夹（§3.3）/ 数据看板（§3.4）
- ✅ Apple 简约高级（§4 铁律逐条对齐）

**2. 规范一致性**
- ✅ 标记并裁决了原型与铁律的冲突（强调色、渐变、圆角），正式实现以铁律 + 现有 token 为准
- ✅ 圆角/字重/强调色/阴影/微交互全部给出可执行约束

**3. 数据与架构一致性**
- ✅ 新消息类型同步 `MessageType` + `MessagePayloads`（CLAUDE.md 强约束）
- ✅ 写操作走 `enqueueWrite`；下载复用 `fetchAndDownload` + `MEDIA_COLLECTOR_DIR`
- ✅ `collectionIds` 向后兼容、无需迁移
- ✅ 不触碰 MAIN-world 注入链路与 `document_start` 约束

**4. 占位符扫描**
- ✅ 无 TBD/未决代码；商业化门控明确划为范围外并说明原因
- ⚠️ 组件级精确 props / 逐步骤代码留待**实施计划**展开（本文是设计文档，按设计阶段定位是正确的）
