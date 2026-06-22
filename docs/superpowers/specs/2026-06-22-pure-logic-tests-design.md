# 第二阶段设计:纯逻辑单测 + 导出路径函数抽出

**日期**: 2026-06-22
**分支**: `refactor/20260622-library-split-tests`
**状态**: 设计已批准,待写实现计划

## 1. 背景与目标

第一阶段清债后,codebase 干净但零自动化测试(仅 a11y audit + 手动 console 脚本)。第二阶段首轮用 vitest 给关键纯逻辑补单测,**锁住行为基线**,为后续 `LibraryPage`(1174 行)/ `makeStyles`(1032 行)拆分提供安全网。

本轮**零运行时风险**:只加测试 + 抽 5 个纯函数到 `lib/`,UI 行为完全不变。

## 2. 范围

**In**:
- 引入 vitest
- 测 8 个纯函数(见 §3)
- 抽 `library.tsx` 的 5 个导出路径函数到 `lib/export-path.ts`

**Out(YAGNI,留后续批次)**:
- React 组件渲染测试
- mock 类测试(`restoreItems` / `saveItems` / `getNoteMediaFromState`)
- `LibraryPage` / `makeStyles` 拆分
- 任何运行时行为变更

## 3. 测试清单

### 3.1 `isUnsafePath`(`background/download.ts`,现成可测)

路径穿越防御。测:
- **拒绝**: `/abs`、`\abs`、`C:\win`、`a/./b`、`a/../b`、`../secret`、`D:\path`
- **放行**: `a/b.jpg`、`5..2促销.jpg`(名字含 `..` 但非独立段)、`folder/sub/name.ext`

### 3.2 导出路径 5 件套(`library.tsx` → `lib/export-path.ts`)

**`sanitizePathSegment(value, fallback)`**:
- 非法字符 `/ \ ? % * : | " < >` → `-`
- 空白折叠 `\s+` → 单空格 + `trim`
- 截断 50 字符
- `.` / `..` / 空 → `fallback`

**`resolveExportFolder(item, ctx)`** 优先级:
1. `ctx.collectionFilter` 命中 → 该收藏夹名
2. `item.collectionIds`:按 `ctx.collections` 顺序首个匹配,否则 `collectionIds[0]` 对应名
3. `item.author`
4. `"未分类"`

**`buildExportFilename(item)`**:
- `video` → `mp4` / `image` → `jpg`
- `baseName = sanitize(title, "素材")`
- `groupIndex` 定义 → `${base}_${padStart(2, index+1)}.${ext}`,否则 `${base}.${ext}`

**`buildExportPath(item, ctx)`**: `${resolveExportFolder}/${buildExportFilename}`

**`summarizeExportFolders(folders)`**: `filter(Boolean)` 后 0 → `""` / 1 → 名 / 多 → `"多个文件夹"`

### 3.3 `getTimeBucket`(`lib/design-tokens.ts`,现成可测)

> ⚠️ **内部用 `new Date()` 取当前时间**,测试必须 mock 时间(`vi.useFakeTimers` + `vi.setSystemTime`),否则结果随运行时刻漂移。

- 设系统时间为某固定时刻,测各 `collectedAt` 落入 今天/昨天/本周/更早
- 边界用例:今天 0 点刚过、昨天 23:59、刚好 7 天前临界、更早

### 3.4 `getDisplayCover`(`library.tsx`,附带,低优先级)

视实现复杂度:若只是 `coverUrl || url` 简单回退则附带测;若依赖 DOM/`Image` 类型则本轮跳过(YAGNI)。

## 4. 抽出计划

新建 **`lib/export-path.ts`**:
- 迁出: `sanitizePathSegment` / `resolveExportFolder` / `buildExportFilename` / `buildExportPath` / `summarizeExportFolders` + `ExportContext` 接口
- 全部 `export`(供测试 import)
- `tabs/library.tsx`:删除原定义,改为 `import { ... } from "../lib/export-path"`

5 个函数高内聚(都是导出路径解析),本就该独立成模块。抽出后 `library.tsx` 减约 65 行,且成为可独立测试单元。

**不动**: `isUnsafePath`(`download.ts`)、`getTimeBucket`(`design-tokens.ts`)已在可测位置。

## 5. vitest 配置

- devDep: `vitest`
- `vitest.config.ts`:
  ```ts
  import { defineConfig } from "vitest/config"
  export default defineConfig({
    test: { environment: "node", include: ["**/*.test.ts"] }
  })
  ```
- `package.json` scripts:
  - `"test": "vitest run"`(CI/一次性)
  - `"test:watch": "vitest"`(开发 watch)
- **不引入 jsdom**(纯函数不需 DOM)。`getTimeBucket` 用 fake timers mock 时间,不需 jsdom。

## 6. 文件组织

测试就近放置(`*.test.ts` 同目录,vitest 默认匹配):
- `lib/export-path.test.ts`
- `background/download.test.ts`
- `lib/design-tokens.test.ts`
- (`getDisplayCover` 若测 → `lib/media-cover.test.ts`,否则跳过)

## 7. 验证标准

- `pnpm test` 全绿
- `pnpm build` 通过(抽出后编译无误)
- `tsc --noEmit` 0 错误
- UI 行为零变化(纯加测试 + 抽函数,用户手测确认无回归)

## 8. 风险

- **低**:抽出导出路径函数时漏改 `library.tsx` 引用 → `tsc`/`build` 立即报错捕获
- **低**:`getTimeBucket` mock 时间写错 → 边界用例必须覆盖"今天 0 点"临界
- **无运行时风险**:不改任何业务逻辑,只移动 + 加测试

## 9. 后续批次(本轮不做)

- mock 类测试:`restoreItems`(去重保序)、`saveItems`(去重)、`getNoteMediaFromState`(双通路回退)
- `LibraryPage` 拆分:抽 custom hooks(`useLibraryData` / `useFilteredItems` / `useSelection`)
- `makeStyles` 拆到 `lib/library-styles.ts`
- 独立组件拆到 `components/`(`Icon` / `Toast` / `Cell` / `Row` / `Dialog` / `Modal`)
