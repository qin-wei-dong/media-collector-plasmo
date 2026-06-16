# 踩坑记录

本文件记录开发过程中踩过的真实坑,避免后续重复犯。每条都包含**症状、根因、解法、教训**。

---

## 一、采集功能(MAIN world / 状态同步)

### 坑 1:采集到"上一个笔记"

**症状**:点笔记 B 的采集按钮,采到的却是笔记 A 的素材。

**根因**:首页点击笔记弹浮层时,详情数据由 **fetch/XHR 动态拉取**,存于 Vue 组件内部,**从不写入 `__INITIAL_STATE__.note.noteDetailMap`**。只有直接打开详情 URL(SSR)时 state 才有数据。原代码假设浮层数据也在 state 里,noteId 未命中时遍历取第一个条目,结果取到了先打开的旧笔记。

**解法**:
- MAIN world 拦截 `fetch`/`XMLHttpRequest` 响应,递归找出笔记对象,按 noteId 缓存到 `localStorage.__mc_notes__`。
- 采集器读取顺序:① API 拦截缓存 → ② `__INITIAL_STATE__`(SSR 兜底)。
- **去掉"取第一个条目"的猜测式兜底**:仅当 noteDetailMap 恰好只有 1 条时才兜底,多笔记场景无精确匹配则返回 null,让 UI 报"读取失败",绝不采错。

**教训**:不要基于假设写代码。AGENTS.md 说"详情页 state 含完整元数据",但**首页浮层不是详情页**——它是 SPA 动态拉取,数据在组件不在全局 state。改版前先实测确认数据到底在哪。

---

### 坑 2:MAIN world 脚本不进 manifest(Plasmo 0.90.5)

**症状**:`xiaohongshu-state.ts`(world: "MAIN")被打包成 `.js`,但 manifest 的 `content_scripts` 里**没有它**。

**根因**:Plasmo 0.90.5 对 `world: "MAIN"` 的 content script 注册不稳定。清缓存冷启动也没用。

**解法**:放弃 Plasmo 的 MAIN world content script 机制。改为 `background` 收到 `INJECT_MAIN_WORLD` 消息后,用 `chrome.scripting.executeScript({ world: "MAIN", func })` 注入。这是 MV3 官方 API,不受 Plasmo manifest 生成问题影响。

**教训**:框架的"魔法"功能(如自动注册 MAIN world)在特定版本可能失效。对关键功能,优先用**框架无关的官方 API**。

---

### 坑 3:小红书 CSP 拦截 inline `<script>` 注入

**症状**:用 `<script>textContent = code</script>` 注入 MAIN world 拦截器,代码在页面 context 执行时被 CSP 静默拦截。

**根因**:小红书 CSP 的 `script-src` 不允许 inline。`<script>` 标签注入 inline 代码是经典 MAIN world 注入法,但在严格 CSP 站点失效。

**解法**:用 `chrome.scripting.executeScript({ world: "MAIN" })`——这是由扩展进程注入的,**完全不受页面 CSP 约束**。MV3 下这是唯一可靠的绕过方式。

**教训**:AGENTS.md 早就提到"API 预取被 CSP 拦",但没意识到 inline script 也会被拦。**严格 CSP 站点上,任何注入页面 context 的代码都要走扩展 API,不能走页面内 `<script>`**。

---

### 坑 4:采集按钮"有时不显示 / 无法点击"

**症状**:按钮时好时坏,有时看不到,有时看得到但鼠标移上去点不了(按钮跟着漂)。

**根因**:按钮挂在 `document.body` 上用 `position:fixed` 算绝对坐标贴媒体元素。问题:
1. 浮层 modal 的 z-index 极高,按钮被盖住 → "不显示"
2. 媒体元素在弹出动效中,`getBoundingClientRect()` 每帧变化,按钮跟着漂 → "无法点击"
3. 浮层关闭时按钮不被清理,变成游离元素,后续复用了游离的旧引用 → 后续都不显示

**解法**:`ensureButton(container)` 把按钮直接 `appendChild` 进**浮层容器内部**,用 `position:absolute` 相对浮层定位:
1. 继承浮层 z-index,永不被盖住
2. 跟随浮层移动,坐标稳定不漂
3. 浮层关闭时按钮随浮层被 Vue DOM diff 清理,无游离元素

**教训**:**注入到第三方页面的 UI 元素,要挂进页面的 DOM 层级里,而不是孤立地挂在 body 上**。否则 z-index 战争和坐标漂移会让你永远在调定位。`ensureButton` 必须 `contains` 检查挂载点,而不是检查 `document.body`。

---

### 坑 4b:`<img>` 是 void 元素,不能 appendChild

**症状**:视频笔记按钮正常显示,图集笔记按钮完全不显示。

**根因**:定位逻辑试图把按钮挂进主媒体元素内部(`mediaEl.appendChild(btn)`)。但 `findMediaEl` 对图集返回的是 `<img>`,而 **`<img>` 是 void/自闭合元素,不能有子节点**——`appendChild` 静默失败,按钮永远挂不上去。`<video>` 不是 void,所以视频正常。

**解法**:按钮不挂媒体元素内部,而是挂浮层容器(或 body),用 `position:fixed` + `getBoundingClientRect()` 计算媒体元素的视口坐标,让按钮视觉上贴媒体左上角。DOM 归属和视觉定位解耦。

**教训**:**HTML void 元素(`<img>`/`<input>`/`<br>`/`<hr>` 等)不能 appendChild**。要往"媒体区域"挂子元素,挂它的父容器,不是媒体元素本身。

---

### 坑 4c:swiper 幻灯片被 `findMediaEl` 误选,按钮定位到视口外

**症状**:图集笔记的采集按钮 `display:flex` 但完全看不到。诊断发现 `getBoundingClientRect().left = -110`,被浮层 `overflow:hidden` 裁掉。

**根因**:小红书图集是 swiper 轮播结构,历史/预备幻灯片被 `translateX` 偏移到视口左/右外侧。它们 `display` 非 none、有尺寸,`isVisible` 过滤不掉。原 `findMediaEl` 按"元素自身面积"比较,所有 `440×340` 幻灯片面积相同,**遍历顺序里视口外那张先到先得**,被误选。它 `left=-124`,按钮定位到 `-110`,被裁。

**解法**:`findMediaEl` 改用**元素与视口的可见交集面积**(`visibleArea`)比较,而非元素自身面积:
```js
function visibleArea(r) {
  const ix = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0))
  const iy = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0))
  return ix * iy
}
```
当前主图全宽在视口内(交集满),视口外幻灯片只有部分交集 → 主图胜出。

**教训**:**轮播/SPA 里"可见"不等于 `display:none`**。绝对定位在视口外的元素 `offsetParent` 非空、有尺寸,常规可见性检查全部失效。判断"用户真正看到的元素",必须用**与视口的交集面积**,不能用元素自身属性。

---

### 坑 4d:采集按钮有"移动过程"(从错位置跳到对位置)

**症状**:图集浮层弹出后,采集按钮先出现在错误位置,再"跳"到正确位置,肉眼可见移动。

**根因**:浮层弹出动画期间,图片尺寸/位置还在变化。`sync` 每 200ms 跑一次:
- 第一次 sync:图片未加载完,`findMediaEl` 选错或回退 → 按钮显示在错误位置
- 200ms 后:图片加载完,选对主图 → 按钮跳到正确位置

按钮全程 `display:flex`,所以**每次坐标变化的跳变都可见**。

**解法**:稳定性确认机制——找到媒体后**先隐藏**,记录候选坐标 `pendingPos`;150ms 后复检,坐标未变才显示:
```js
if (posKey === pendingPos) {
  btn.style.display = "flex"  // 连续两次一致 → 稳定,显示
} else {
  btn.style.display = "none"  // 位置变了 → 隐藏,等下次
  pendingPos = posKey
  setTimeout(sync, 150)
}
```
按钮要么不显示,要么在最终稳定位置一次性出现,零跳动。

**教训**:**动效中的 UI 定位,不能"边算边显示"**。要么等动画结束(稳定性确认)再显示,要么用 `visibility:hidden` 占位但不可见。凡是依赖第三方页面 DOM 尺寸的定位,都要防"首帧尺寸≠最终尺寸"导致的跳动。

---

## 二、Popup 样式

### 坑 5:popup 圆角外露出白边

**症状**:popup 设了 `border-radius`,但圆角外有一圈白底。

**根因**:Chrome popup 的 `html`/`body` 默认白底。即使 popup.html 里写了 `background:transparent`,Chrome 窗口根容器仍是白的,transparent 反而透出白色。

**解法**:html/body 直接设**不透明深色**(`background:#0a0a0c`),不用 transparent。圆角内外的深色一致,就看不到边框。若要圆角轮廓可辨,加 `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06)`(极淡内描边),**不要用白色外阴影**。

**教训**:popup 的背景色策略和普通网页相反——普通网页 transparent 透出父级,popup transparent 透出的是 Chrome 窗口白底。**popup 要么完全不透明,要么深色铺满**。

---

### 坑 6:Chrome 不认 `scrollbar-width:none`(inline style)

**症状**:`React.CSSProperties` 里写了 `scrollbarWidth: "none"`,滚动条仍显示。

**根因**:`scrollbar-width` 是 Firefox 属性,Chrome 隐藏滚动条需要 `::-webkit-scrollbar { display:none }`。而 **`::-webkit-scrollbar` 是 CSS 伪元素,不能写在 inline style 里**,inline style 只支持元素样式。所以写在 `React.CSSProperties` 里完全没生效。

**解法**:把滚动条隐藏规则放到 popup.html 的全局 `<style>` 标签里(`*::-webkit-scrollbar{display:none}`),对 popup 内所有可滚动元素生效。inline style 永远无法控制伪元素。

**教训**:**inline style 不支持伪元素和伪类**。需要 `::before`/`::after`/`::-webkit-scrollbar`/`:hover` 等,必须用 `<style>` 标签或 CSS 类。React inline style 只适合元素自身的属性。

---

### 坑 7:采集时没存 coverUrl,Hero/MediaCard 显示空白

**症状**:popup 的 Hero 大封面和卡片封面图不显示。

**根因**:`collectImages` 只存了每张图的 `url`,没有 `coverUrl` 字段。Hero 用 `coverUrl || url` 回退,但视频没有封面、且图集防盗链 URL 在扩展上下文可能加载失败时,`background-image` 显示空白/碎图。

**解法**:
1. 采集时把首图 URL 作为 `coverUrl` 存进每条素材(`xhs-detail-collector.ts` + `background` + `types.ts` 三处都要透传)。
2. Hero/MediaCard 用 `<img onError>` 替代 `background-image`,失败时降级到灰色渐变占位,不留白。

**教训**:**新增字段要全链路透传**——采集端、消息 payload、background 存储、types 类型定义,任何一处漏了都失效。改数据结构时用 grep 全局搜索字段名确认所有引用点。

---

### 坑 7b:下载三连坑——content script 无 chrome.downloads / service worker 无 createObjectURL / xiaohongshu 未注册消息处理器

**症状**:popup 点下载提示"下载失败",图片视频都无法下载。报错 `Cannot read properties of undefined (reading 'download')` 或 `URL.createObjectURL is not a function`。

**根因(三个叠加)**:

1. **xiaohongshu.ts 从未注册 `DOWNLOAD_IMAGES` 处理器**。下载链路是 popup → background → content script(`DOWNLOAD_IMAGES` 消息),但只有 `douyin.ts` 调了 `registerContentMessageHandler`,小红书一直漏了。小红书 tab 收到消息没人处理 → 直接失败。

2. **`chrome.downloads` API 在 content script 里不存在**。即使注册了处理器,`handleDownloadImages` 里调 `chrome.downloads.download()` 会崩——`chrome.downloads` 只能在 background service worker 里调用,content script 的 `chrome` 对象是阉割版。

3. **`URL.createObjectURL` 在 service worker 里不存在**。把下载逻辑挪到 background 后,service worker 没有 DOM API,`URL.createObjectURL(blob)` 会报 `is not a function`。

**解法**:彻底重构下载链路——**全部在 background service worker 内完成,不走 content script**:
```
popup → background:
  fetch(url, {headers:{Referer}})   ← service worker fetch 带防盗链 Referer
  → blob → FileReader.readAsDataURL ← blob 转 data URL(不依赖 createObjectURL)
  → chrome.downloads.download({url: dataUrl})  ← service worker 有此 API
```
关键:
- 不再依赖 content script 中转(解决坑 1+2)
- blob → data URL 用 `FileReader`(service worker 可用),不用 `URL.createObjectURL`(解决坑 3)
- 下载不再需要平台标签打开,在哪都能下载

**教训**:
- **MV3 的三层运行环境有各自的 API 边界,不能混用**:
  - `chrome.downloads` / `chrome.scripting` / `chrome.tabs` → 只在 **background service worker**
  - `URL.createObjectURL` / `document` / `window` → 只在 **content script / popup**(有 DOM 的环境)
  - `chrome.storage` / `chrome.runtime.sendMessage` → 各层都有
- **改下载/采集这类跨层功能时,先确认每个 API 调用点在哪个层跑,那个层支不支持**。别假设"chrome.* 到处都有"。
- service worker 里处理二进制数据(blob),用 `FileReader.readAsDataURL` 转 base64,不用 `createObjectURL`。

---

## 三、开发流程

### 坑 8:改了代码但采集按钮"又坏了"

**症状**:只改了 popup 宽度/高度,采集按钮却突然不工作。

**根因**:Chrome MV3 **刷新扩展时,content script 不会被重新注入到已打开的页面**。旧页面跑的是旧版 content script,它和新版 background 的消息协议/字段对不上,表现为"功能又坏了"。和代码改动完全无关,是版本错位。

**解法**:每次改完代码,严格按流程重载:
1. `chrome://extensions/` → 扩展刷新
2. **关掉所有目标站点标签**(小红书/抖音)
3. **新开标签**重新打开

第 2、3 步缺一不可。只刷新扩展不重开页面 = 白刷。

**教训**:**MV3 content script 的生命周期和页面绑定,不和扩展绑定**。开发期频繁改代码时,养成"刷新扩展必关标签重开"的肌肉记忆。最稳妥的做法:开发时只开一个目标站点标签,每次重载都关掉重开。

---

### 坑 9:多个 dev server 同时运行导致构建冲突

**症状**:manifest 里 content script 时有时无,行为不可预测。

**根因**:后台遗留多个 `plasmo dev` 进程(不同时间启动的),它们都会写 `build/` 目录,导致 manifest 互相覆盖、文件状态错乱。

**解法**:改代码前先 `pkill -f "plasmo dev"` 杀干净,再单开一个。或用 `ps aux | grep plasmo` 确认只有一个进程。

**教训**:**Plasmo dev 是单实例工具**。发现构建产物异常(文件缺失、manifest 错乱),第一时间检查有没有多个 dev server 同时跑。

---

### 坑 10:在错误方向上反复打磨细节

**症状**:用户说"视觉不够高级",我连续多轮调整色值、字重、圆角等数值级细节,用户说"看不出区别"。

**根因**:用户要的是**结构性视觉升级**(如深色沉浸 + 内容即设计),我却在**同一套设计上微调参数**。色值从 `#007AFF` 改到 `#0066cc`、字重剔除 500、圆角 14→18——这些正确但肉眼难辨。方向错了,精度再高也没用。

**解法**:听到"不满意"时,先问**是哪个层级不满意**(配色?布局?质感?时代感?),而不是立刻动手改细节。提供**视觉差异巨大的多个方向**(如浅色列表 vs 深色沉浸 vs 瀑布流),让用户先选方向,再打磨细节。

**教训**:**方向 > 精度**。用户说"不满意"时,停下来问"差的是哪一层",而不是闷头微调。大改方向(推翻重做)比小改参数(微调色值)更容易让用户感知到"变了"。在 mockup 阶段用差异巨大的方案对比,远胜于在同一个方案上反复微调。

---

### 坑 11:popup 设计 token 双源导致后期统一困难

**症状**:`mockups/tokens.css` 里有完整的 Apple Liquid Glass 规范(强调色 `#0066cc`、圆角 5 档、8pt 间距),popup 实现时另起 `popup-theme.ts` 用 `accent: #ffffff`、圆角 6 档 (8/10/14/16/22/pill)、间距不系统。代码长出来一两年后,产品要换品牌色 / 调圆角 / 加 button size 时,要在两套体系里都改,且容易遗漏。

**根因**:设计 token 没有真正成为"单一真相源"——`mockups/tokens.css` 只是参考 demo,`popup-theme.ts` 是实际生效源;两者没人强制对齐,各写各的。

**解法**:
- 在 popup-theme.ts 顶部加注释明确「这是唯一权威源,禁止内联 hex」
- 把圆角档收齐为 5 档(5/8/11/18/pill)与 tokens.css 对齐
- 新增 `sp`(8pt 间距 7 档) / `btn`(按钮尺寸 4 档) / `fs`(字号 6 档) / `focus`(focus ring) token,把组件里所有 magic value 替换成 token
- 用 `pnpm build` 不报错当唯一校验(没有 lint 强制使用 token),但把规则写进 `popup-theme.ts` 顶部 doc comment + CLAUDE.md「Key Conventions」段落

**教训**:**设计 token 必须单源,要么完全用 CSS 变量(让设计师改 CSS 就生效),要么完全用 TS object(让 TS 类型系统兜底),不要"两份规范"**。一旦双源,后期统一成本指数增长。理想方案:把 tokens.css 迁移成 TS module,组件 props 接受 token 名而非 magic number——目前未实现(P3-19)。

---

### 坑 12:删除确认用「时间倒计时」是反人类设计

**症状**:FloatBar 删除按钮点击后,按钮变红 + 文字变「确认」+ 底部出现一根 2px 红色细线,3 秒内必须再点一次,否则自动取消。用户反馈"完全看不懂在倒计时什么"、"线太细根本注意不到"。

**根因**:用「时间窗口 + 二次点击」做确认,意图是防止误删,但把"窗口状态"用了一个非常弱的视觉信号(2px 细线)承载,普通用户完全无感。同时没有取消入口,只能等 3 秒。

**解法**:改为现代 UX 标准模式 —— **立即删除 + 底部 Toast「已删除 N 项」+ 5 秒可点「撤销」**:
- `components/Toast.tsx` 通用 snackbar(支持 action 按钮 + 自动消失 + 入场动画)
- `types.ts` 新增 `RESTORE_ITEMS` 消息 + `MessagePayloads`
- `background/storage.ts` 新增 `restoreItems(items)`,按 id 去重,保留原始 `id` / `collectedAt`,让撤销后的排序与删除前完全一致
- `popup.tsx` 在删除前 `setDeletedBackup(selectedItems.map(({_selected, ...rest}) => rest))` 备份,点击撤销时 `sendMessage({type:"RESTORE_ITEMS", payload: deletedBackup})`
- FloatBar 简化为单次点击 + 删除按钮恢复普通垃圾桶图标(不再有"确认态")

**教训**:**删除这类高破坏操作,UX 的金标准是「立即生效 + 可撤销」**(Gmail / Notion / Apple 邮件都是这套),而不是「二次确认 + 时间窗口」**。后者要么用 modal(强阻断),要么用足够强的视觉信号承载倒计时;细线 + 自动取消 = 普通用户直接错过。改造前用模态弹窗也行,但 Toast 撤销对批量删除更友好。

---

## 四、快速自检清单

下次改代码前,过一遍这个清单:

- [ ] **改 content script / background 后**:必须刷新扩展 + 关闭目标站点所有标签 + 新开标签
- [ ] **只有单个 dev server**:`ps aux | grep plasmo` 确认无残留进程
- [ ] **新增/改字段**:grep 全局搜索字段名,确认 types / 采集端 / background / 组件全链路透传
- [ ] **新增 MessageType**:同步更新 `types.ts` 的 `MessageType` 联合 + `MessagePayloads`,background 的 `switch` 用 `as MessagePayloads["YOUR_TYPE"]` 收窄
- [ ] **滚动条/伪元素**:不能用 inline style,必须放 `<style>` 标签
- [ ] **注入页面 context**:严格 CSP 站点用 `chrome.scripting.executeScript`,不用 inline `<script>`
- [ ] **第三方页面 UI**:挂进页面 DOM 层级(如浮层内),不要孤立挂 body
- [ ] **void 元素不能 appendChild**:`<img>`/`<input>`/`<br>` 没有子节点,要挂子元素挂它的父容器
- [ ] **轮播/SPA 找"可见"元素**:用与视口的交集面积判断,不能用元素自身面积/offsetParent
- [ ] **动效中的定位**:不要"边算边显示",用稳定性确认(连续两次坐标一致)再显示,避免跳动
- [ ] **用户说"不满意"**:先问方向,不要闷头微调细节
- [ ] **设计 token 必须单源**:改色 / 圆角 / 间距时改 `popup-theme.ts` 一处即可,组件禁止内联 magic value
- [ ] **icon-only 按钮必带 aria-label**:Tab 键用户和读屏用户的可达性基本要求
- [ ] **删除等破坏性操作**:用 Toast 撤销,不用「时间倒计时二次确认」
- [ ] **调试定位问题**:不要盲改,先用 `getBoundingClientRect()` dump 实际坐标,用真实数据定位根因
- [ ] **跨层 API**:确认每个 chrome.*/DOM API 在哪个层(background/content/popup)跑,该层支不支持
  - `chrome.downloads/scripting/tabs` → 只在 background service worker
  - `URL.createObjectURL/document/window` → 只在有 DOM 的环境(content/popup),service worker 没有
  - service worker 里 blob → 用 `FileReader.readAsDataURL`,不用 `createObjectURL`
