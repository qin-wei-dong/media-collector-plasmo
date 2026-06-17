# M7 发布收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 v2.1.0 后的发布版本收敛为“小红书素材采集与本地管理工具”，移除当前对外抖音承诺，准备 Chrome Web Store 上架所需文档、权限说明、隐私说明和验收清单。

**Architecture:** M7 不改采集主链路，不引入收费、账号或云服务。实现上先做 manifest 权限最小化和 Douyin content script 下线，再同步 README / AGENTS / CHANGELOG / package 文案，最后新增商店文案、隐私说明和发布验收清单。

**Tech Stack:** Plasmo MV3、React 18、TypeScript、Chrome Web Store 手动发布流程、现有 `docs/superpowers/` 计划格式

---

## File Structure

- Modify `package.json`
  - 将 `description` 从“小红书、抖音”收敛为“小红书”。
  - 从 `manifest.host_permissions` 移除 `https://www.douyin.com/*`。
  - 将 `commands.collect_media.description` 改为小红书语境。
- Delete `contents/douyin.ts`
  - Plasmo 会自动注册 `contents/*.ts`，删除文件才能避免发布版继续注入抖音页面。
- Modify `README.md`
  - 修正产品定位、功能列表、使用方法、项目结构、发布说明。
  - 删除当前发布承诺中的抖音采集。
  - 修正已删除 popup 入口描述。
- Modify `AGENTS.md`
  - 修正当前架构：action 点击直接打开 `tabs/library.html`。
  - 标注抖音采集暂不作为发布承诺，避免后续 agent 误恢复。
- Modify `CHANGELOG.md`
  - 新增 `Unreleased` 或 `2.1.1` 发布收口段，说明 M7 调整。
- Create `docs/release/chrome-web-store-listing.md`
  - 可直接复制到商店后台的标题、短描述、长描述、权限说明。
- Create `docs/release/privacy.md`
  - 当前版本隐私说明草案。
- Create `docs/release/release-checklist.md`
  - 发布前手动验证清单。
- Test with `pnpm build`, `pnpm package`, `pnpm audit:a11y`
  - 确认删除 Douyin content script 后构建通过。

## Task 1: Manifest 与 Douyin 下线

**Files:**
- Modify: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/package.json`
- Delete: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/contents/douyin.ts`

- [ ] **Step 1: 修改 package 文案和权限**

Update `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/package.json`:

```json
{
  "description": "一键采集小红书笔记图片和视频素材",
  "manifest": {
    "host_permissions": [
      "https://www.xiaohongshu.com/*"
    ],
    "commands": {
      "collect_media": {
        "description": "采集当前小红书笔记素材"
      }
    }
  }
}
```

Keep all unrelated fields exactly as they are.

- [ ] **Step 2: 删除抖音 content script**

Delete:

```bash
rm contents/douyin.ts
```

Reason: Plasmo file-based routing registers `contents/*.ts` automatically. M7 发布版不承诺抖音采集，删除该文件才能确保发布包不会继续注入抖音页面。

- [ ] **Step 3: 搜索残留抖音发布承诺**

Run:

```bash
rg -n "抖音|douyin|Douyin" package.json contents background lib tabs README.md AGENTS.md CHANGELOG.md docs
```

Expected:

- `package.json` should not contain `douyin.com`.
- `contents/douyin.ts` should not exist.
- Remaining matches are either historical changelog, internal notes, or explicit “暂不发布承诺 / 后续评估” wording.

- [ ] **Step 4: Build check**

Run:

```bash
pnpm build
```

Expected:

- Command exits 0.
- No missing import from deleted `contents/douyin.ts`.

- [ ] **Step 5: Commit Task 1**

```bash
git add package.json contents/douyin.ts
git commit -m "chore(release): scope manifest to xiaohongshu"
```

## Task 2: README 发布定位收口

**Files:**
- Modify: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/README.md`

- [ ] **Step 1: 更新标题区与简介**

Change the top description to:

```markdown
# 素材采集助手

**当前版本: v2.1.0**([CHANGELOG](./CHANGELOG.md)) | 小红书素材采集与本地管理

点开小红书笔记后，一键采集图片或视频素材，并在本地素材库中统一管理、收藏和批量导出。
```

- [ ] **Step 2: 删除“抖音采集”公开功能段**

Remove the `### 抖音采集` section from README.

In `### 通用功能`, remove wording that implies Douyin support. Keep platform/type filtering only if worded generically or xiaohongshu-specific.

- [ ] **Step 3: 更新使用方法**

Replace usage steps with:

```markdown
1. 在 Chrome `chrome://extensions` 加载 `build/chrome-mv3-dev` 目录
2. 打开小红书网站
3. 点开笔记（首页浮层或独立详情页均可），点击「采集素材」按钮一键采集全部图片/视频
4. 点击扩展图标打开全屏素材库
5. 在素材库中搜索、收藏、预览、批量选择和导出
```

- [ ] **Step 4: 更新采集说明表**

Use:

```markdown
| 场景 | 是否能采集图片/视频 |
|------|--------------|
| **小红书笔记**（点开笔记：首页浮层或独立详情页） | ✅ 一键采集全部图片或视频 |
| **小红书信息流瀑布流**（不点开笔记，直接 hover） | ❌ 不支持，请点开笔记 |
| **抖音等更多平台** | ⏳ 暂不作为当前发布承诺，后续根据用户反馈评估 |
```

- [ ] **Step 5: 修正项目结构**

Remove these current-entry lines:

```markdown
├── popup.tsx                  ← 弹窗主组件(...)
├── popup.html                 ← 弹窗容器(...)
```

Add:

```markdown
├── tabs/
│   └── library.tsx            ← 全屏素材库入口(action 点击直接打开 tabs/library.html)
```

Ensure `components/` is described as library/shared components, not popup-only.

- [ ] **Step 6: 更新发布手动验证**

Replace “采集 / popup / 库页 / 主题切换 / 收藏夹 / 导出” with:

```markdown
采集 / 打开素材库 / 主题切换 / 收藏夹 / 导出 / 导出历史
```

- [ ] **Step 7: README residual scan**

Run:

```bash
rg -n "抖音|douyin|popup\\.tsx|popup\\.html|点击扩展图标查看采集列表" README.md
```

Expected:

- No `douyin`.
- No `popup.tsx` / `popup.html`.
- `抖音` only appears in “后续根据用户反馈评估” if retained in the采集说明 table.

- [ ] **Step 8: Commit Task 2**

```bash
git add README.md
git commit -m "docs: align readme with xhs release scope"
```

## Task 3: AGENTS 与 CHANGELOG 收口

**Files:**
- Modify: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/AGENTS.md`
- Modify: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/CHANGELOG.md`

- [ ] **Step 1: 更新 AGENTS 架构描述**

In `AGENTS.md`, replace any statement that says `popup.tsx` is the current UI entry with:

```markdown
`tabs/library.tsx` 是当前主要 UI 入口。`background/index.ts` 监听 `chrome.action.onClicked`，点击扩展图标会直接打开或聚焦 `tabs/library.html`。旧 popup 弹窗已在 v2.1.0 后下线，不要再把 popup 当作当前发布入口。
```

- [ ] **Step 2: 更新 AGENTS 抖音约束**

Add a release-scope note near the collection-mode section:

```markdown
## 发布范围说明(M7)

当前公开发布版只承诺小红书素材采集与本地管理。抖音采集暂不作为发布承诺，`contents/douyin.ts` 在发布收口中下线；后续是否恢复取决于真实用户反馈和稳定性验证。不要在 README、商店文案或 manifest 权限中重新承诺抖音，除非已有新的 M 级计划明确批准。
```

- [ ] **Step 3: 更新 CHANGELOG**

Add an `Unreleased` section above `2.1.0`:

```markdown
## [Unreleased]

### 变更

- **发布收口(M7)**:公开定位收敛为“小红书素材采集与本地管理工具”;抖音采集暂不作为当前发布承诺,后续根据用户反馈评估。
- **权限最小化(M7)**:发布版移除 Douyin host permission 和 Douyin content script,降低 Chrome Web Store 审核解释成本。
- **文档一致性(M7)**:README / AGENTS / 商店文案 / 隐私说明同步当前 action 点击直达全屏素材库的架构。
```

- [ ] **Step 4: Scan docs for contradictory claims**

Run:

```bash
rg -n "支持抖音|抖音视频\\) \\| ✅|popup\\.tsx 是|popup\\.html|Chrome extension.*Douyin|小红书、抖音" AGENTS.md CHANGELOG.md README.md package.json docs
```

Expected:

- No current publishing promise for Douyin.
- Historical changelog can mention old behavior, but new sections must clearly state M7 release scope.

- [ ] **Step 5: Commit Task 3**

```bash
git add AGENTS.md CHANGELOG.md
git commit -m "docs: document m7 release scope"
```

## Task 4: Chrome Web Store 文案与隐私说明

**Files:**
- Create: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/docs/release/chrome-web-store-listing.md`
- Create: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/docs/release/privacy.md`

- [ ] **Step 1: Create release docs directory**

```bash
mkdir -p docs/release
```

- [ ] **Step 2: Write Chrome Web Store listing**

Create `docs/release/chrome-web-store-listing.md` with:

```markdown
# Chrome Web Store Listing

## 标题

素材采集助手 - 小红书素材管理

## 短描述

一键采集小红书笔记图片/视频，统一管理、收藏和批量导出。

## 长描述

素材采集助手是一款面向内容创作者的小红书素材采集与本地管理工具。

打开小红书笔记后，页面内会出现「采集素材」按钮。点击后可将当前笔记中的图片或视频加入本地素材库。素材库支持搜索、筛选、预览、收藏夹、批量选择、分文件夹导出、导出历史和失败项重试。

当前版本重点支持小红书笔记浮层和独立详情页。抖音等更多平台会根据用户反馈和稳定性验证再评估。

所有素材索引、收藏夹和导出历史默认保存在浏览器本地。扩展不会要求注册登录，也不会把你的素材列表上传到服务器。

## 主要功能

- 小红书笔记图片/视频一键采集
- 全屏素材库工作台
- 收藏夹、置顶、改色、批量移动
- 图片/视频预览
- 批量导出与分文件夹命名
- 导出历史和失败项重试
- 大素材量渐进渲染

## 权限说明

- `storage`: 保存本地素材索引、收藏夹、主题偏好和导出历史。
- `downloads`: 将用户主动选择的素材导出到本地下载目录。
- `scripting`: 在小红书页面注入采集按钮和 MAIN world 状态拦截器。
- `activeTab`: 配合当前标签页采集操作使用。
- `tabs`: 打开或聚焦全屏素材库页面。
- `notifications`: 展示采集、导出和失败提示。
- `contextMenus`: 提供右键采集入口。
- `https://www.xiaohongshu.com/*`: 仅用于在小红书页面展示采集按钮并读取当前笔记素材信息。

## 当前限制

- 不支持小红书信息流未点开状态下的 hover 采集。
- 当前发布版不承诺抖音采集。
- 不提供云同步或账号系统。
```

- [ ] **Step 3: Write privacy draft**

Create `docs/release/privacy.md` with:

```markdown
# 隐私说明

素材采集助手重视用户隐私。当前发布版以本地使用为主，不要求注册或登录。

## 数据存储

扩展会在浏览器本地保存以下数据：

- 已采集素材的 URL、标题、来源页面、作者、类型、采集时间等索引信息。
- 收藏夹名称、颜色、排序和素材归属关系。
- 导出历史、导出结果和失败项重试所需的最小信息。
- 主题偏好等界面设置。

这些数据保存在 `chrome.storage.local` 中。

## 数据传输

扩展不会将你的素材列表、收藏夹或导出历史上传到我们的服务器。当前版本没有账号系统、云同步或远程数据库。

当你主动导出素材时，扩展会请求对应素材 URL，并通过 Chrome 下载能力保存到本地下载目录。

## 权限用途

- `storage`: 保存本地素材索引和用户设置。
- `downloads`: 保存用户主动导出的素材文件。
- `scripting`: 在小红书页面注入采集按钮。
- `activeTab` / `tabs`: 与当前标签页交互，并打开素材库页面。
- `notifications`: 展示采集和导出结果。
- `contextMenus`: 提供右键采集入口。
- `https://www.xiaohongshu.com/*`: 在小红书页面识别当前笔记素材。

## 付费信息

当前版本不接入支付系统，不收集支付信息。

## 联系与反馈

如需反馈问题或请求删除本地数据，请在扩展中清空素材库，或通过 Chrome 扩展管理页移除扩展。
```

- [ ] **Step 4: Scan release docs**

Run:

```bash
rg -n "抖音|douyin|上传|支付|小红书" docs/release
```

Expected:

- `抖音` only appears as “当前发布版不承诺抖音采集 / 后续评估”。
- Privacy doc states no upload and no payment.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/release/chrome-web-store-listing.md docs/release/privacy.md
git commit -m "docs: add chrome store listing and privacy drafts"
```

## Task 5: 发布验收清单

**Files:**
- Create: `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/docs/release/release-checklist.md`

- [ ] **Step 1: Create checklist**

Create `docs/release/release-checklist.md` with:

```markdown
# Release Checklist

## Build

- [ ] `pnpm build` exits 0.
- [ ] `pnpm package` exits 0.
- [ ] `pnpm audit:a11y` exits 0.
- [ ] `build/chrome-mv3-prod.zip` exists.

## Manifest

- [ ] `host_permissions` only includes `https://www.xiaohongshu.com/*`.
- [ ] No Douyin content script exists in the production build.
- [ ] Extension action click opens or focuses `tabs/library.html`.

## Chrome Manual Validation

- [ ] Install `build/chrome-mv3-prod` via `chrome://extensions`.
- [ ] Click extension icon and confirm the full-screen library opens.
- [ ] Open a Xiaohongshu note in feed modal and collect image note.
- [ ] Open a Xiaohongshu note detail page and collect image note.
- [ ] Collect a Xiaohongshu video note.
- [ ] Search by title or author in library.
- [ ] Filter by type: image / video.
- [ ] Preview image and video.
- [ ] Select all current filtered results.
- [ ] Cancel select all.
- [ ] Create collection.
- [ ] Rename collection.
- [ ] Change collection color.
- [ ] Pin collection.
- [ ] Move selected items to another collection.
- [ ] Remove items from current collection.
- [ ] Delete selected items.
- [ ] Undo deletion from Toast.
- [ ] Batch export selected items.
- [ ] Open export history.
- [ ] Retry failed export item if any failure is available.
- [ ] Load 500 sample items and confirm the library does not white-screen.
- [ ] Confirm progressive render counter and load-more behavior.

## Store Listing

- [ ] Title matches `素材采集助手 - 小红书素材管理`.
- [ ] Short description does not promise Douyin.
- [ ] Long description says Douyin is not current release scope.
- [ ] Permission explanations match manifest.
- [ ] Privacy statement says no login, no upload, no payment collection.

## Release Decision

- [ ] README, CHANGELOG, AGENTS are updated.
- [ ] Chrome Web Store listing draft reviewed.
- [ ] Privacy draft reviewed.
- [ ] User has approved release candidate.
```

- [ ] **Step 2: Run formatting-safe diff check**

Run:

```bash
git diff --check -- docs/release/release-checklist.md
```

Expected:

- No trailing whitespace warnings.

- [ ] **Step 3: Commit Task 5**

```bash
git add docs/release/release-checklist.md
git commit -m "docs: add release checklist"
```

## Task 6: Final Verification

**Files:**
- Verify all files changed by M7.

- [ ] **Step 1: Run code and doc scans**

```bash
rg -n "https://www.douyin.com|contents/douyin|支持抖音|一键采集小红书、抖音|popup\\.tsx|popup\\.html" package.json README.md AGENTS.md CHANGELOG.md docs contents background tabs lib
```

Expected:

- No active publishing promise for Douyin.
- No Douyin host permission.
- No current-entry docs pointing to popup.
- Historical mentions are clearly scoped as history or “not current release scope”.

- [ ] **Step 2: Run build and package**

```bash
pnpm build
pnpm package
pnpm audit:a11y
```

Expected:

- All commands exit 0.
- `build/chrome-mv3-prod.zip` exists.

- [ ] **Step 3: Inspect production manifest**

Run:

```bash
node -e 'const m=require("./build/chrome-mv3-prod/manifest.json"); console.log(JSON.stringify({host_permissions:m.host_permissions, content_scripts:m.content_scripts?.map(s=>s.matches)}, null, 2))'
```

Expected:

```json
{
  "host_permissions": [
    "https://www.xiaohongshu.com/*"
  ],
  "content_scripts": [
    [
      "https://www.xiaohongshu.com/*"
    ]
  ]
}
```

- [ ] **Step 4: Manual Chrome validation**

Follow `/Users/qinweidong/MyDemo/VibeCoding/media-collector-plasmo/docs/release/release-checklist.md` and check off results manually.

- [ ] **Step 5: Commit final fixes if needed**

If verification required any fixes:

```bash
git add <fixed-files>
git commit -m "fix(release): address m7 verification findings"
```

If no fixes are needed, do not create an empty commit.

## Self-Review Checklist

- Spec coverage: This plan covers product positioning, Douyin de-scope, free Beta/no payment, docs, store listing, privacy, permission minimization, and release verification.
- Placeholder scan: No task uses TBD/TODO/fill-in placeholders.
- Type consistency: No new runtime types are introduced. Manifest and docs are the only intended contract changes.
- Scope check: M7 avoids Pro/payments and avoids new collection/download features.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-m7-release-closure-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
