---
name: apple-liquid-glass
description: Generate Apple-style (简约高级、2026 Liquid Glass 趋势) frontend interfaces — HTML mockups, React/TSX components, popup UI. Use whenever the user asks for Apple-style design, minimalist UI, "高级感" interfaces, iOS/macOS-style components, or wants to (re)design any frontend page/component with a premium Apple aesthetic. Triggers on phrases like "Apple 风格", "苹果风", "简约高级", "重新设计界面", "设计 popup", "liquid glass", "毛玻璃", and any request to make UI look more premium/refined.
---

# Apple Liquid Glass 设计技能

生成 Apple 官方设计语言（2026 Liquid Glass 时代）的前端界面。规范来自 Apple 官网逆向出的真实 DESIGN.md + WWDC25 Liquid Glass 设计语言，**不是凭记忆**。

## 核心铁律（违反即失去 Apple 感）

这些是从 Apple 真实站点逆向出的、不可妥协的规则。务必内化：

1. **只有一个强调色**：`#0066cc`（Action Blue）。所有可交互元素（链接、CTA、focus ring）都用它。**不要引入第二个品牌色**。暗色面用 `#2997ff`（Sky Link Blue）。
2. **字重阶梯刻意剔除 500**：只有 `300 / 400 / 600 / 700`。正文 400，强调 600，标题 600（不是 700），极少处用 300（大号轻空气感）。**永远不要用 500**。
3. **正文字号是 17px，不是 16**。多这一像素是 Apple 的"阅读而非扫描"节奏。
4. **阴影只给产品图**：唯一允许的投影是 `rgba(0,0,0,0.22) 3px 5px 30px`，且只用于浮在表面上的图片/渲染图。**卡片、按钮、文字一律无阴影**——层次靠「表面色变化」和「hairline border」实现。
5. **大标题负字距**：≥17px 的标题都要 `letter-spacing: -0.2px ~ -0.374px`，这是"Apple tight"标志。≤12px 不收紧。
6. **微交互统一 `scale(0.95)`**：所有按钮的 active/press 态用 `transform: scale(0.95)`，不是改色、不是加阴影。
7. **圆角只有四档**：`8px`(紧凑工具) / `11px`(珍珠按钮) / `18px`(卡片) / `pill`(胶囊 CTA/搜索/选项 chip)。**不要用 10/12/14/16 这些中间值**。
8. **不要装饰性渐变**。氛围来自摄影/内容，不是 CSS gradient overlay。
9. **行高分级**：标题 1.07–1.19（紧），正文 1.47（编辑式），密集链接列 2.41（呼吸）。
10. **近黑不用纯黑**：文字/深色面用 `#1d1d1f`，不是 `#000`（只有全屏播放器/全局 nav 才用真黑 `#000`）。

## 设计 Token（直接用，勿自创）

### 颜色

```css
/* 强调 */
--ac-blue:        #0066cc;   /* 唯一 Action Blue,所有交互 */
--ac-blue-focus:  #0071e3;   /* focus ring outline */
--ac-blue-dark:   #2997ff;   /* 暗色面上的链接 */

/* 表面(明) */
--canvas:         #ffffff;   /* 主画布 */
--parchment:      #f5f5f7;   /* Apple 标志性暖白,交替浅色块/footer */
--pearl:          #fafafc;   /* 次级 ghost 按钮填充,比 parchment 更浅 */

/* 表面(暗) */
--tile-1:         #272729;   /* 主暗色块 */
--tile-2:         #2a2a2c;   /* 微亮一档,暗块相邻时的极淡分隔 */
--tile-3:         #252527;   /* 微暗一档,底部/播放器 */
--void:           #000000;   /* 真黑,仅全屏播放器/全局 nav */

/* 文字 */
--ink:            #1d1d1f;   /* 所有明面文字/标题 */
--ink-80:         #333333;   /* pearl 按钮上的文字 */
--ink-48:         #7a7a7a;   /* 禁用态/法律小字 */
--on-dark:        #ffffff;   /* 暗面文字 */
--on-dark-muted:  #cccccc;   /* 暗面次要文字 */

/* 线条 */
--divider-soft:   #f0f0f0;   /* 次级按钮 ring,常作 rgba(0,0,0,0.04) */
--hairline:       #e0e0e0;   /* 卡片/chip 1px 边 */
--chip-glass:     rgba(210,210,215,0.64); /* 图上的圆形控件 */
```

### 字体（Apple Type Scale）

```css
--font-display: "SF Pro Display, system-ui, -apple-system, sans-serif"; /* ≥19px */
--font-text:    "SF Pro Text, system-ui, -apple-system, sans-serif";    /* <20px */

/* 阶梯(字号/字重/行高/字距) */
--ts-hero:       56px/600/1.07/-0.28px;    /* hero 大标题 */
--ts-display-lg: 40px/600/1.10/0;          /* 块标题 */
--ts-display-md: 34px/600/1.47/-0.374px;   /* 章节标题 */
--ts-lead:       28px/400/1.14/0.196px;    /* 副标题 */
--ts-tagline:    21px/600/1.19/0.231px;    /* 子标题 */
--ts-body-strong:17px/600/1.24/-0.374px;   /* 内联强调 */
--ts-body:       17px/400/1.47/-0.374px;   /* 正文(默认) */
--ts-caption:    14px/400/1.43/-0.224px;   /* 说明/按钮文字 */
--ts-fine:       12px/400/1.0/-0.12px;     /* 小字/footer */
--ts-micro:      10px/400/1.3/-0.08px;     /* 法律微字 */
--ts-nav:        12px/400/1.0/-0.12px;     /* 导航链接 */
```

**非 Apple 平台替代字体**：用 `Inter`(Google Fonts, variable)，weight 600 + `font-feature-settings:"ss03"` 近似 SF Pro。display 尺寸额外 `letter-spacing:-0.01em`，正文行高从 1.47 降到 1.44（Inter 的 x-height 更高）。

### 间距（8pt 栅格）

```css
--sp-xxs:4px; --sp-xs:8px; --sp-sm:12px; --sp-md:17px;
--sp-lg:24px; --sp-xl:32px; --sp-xxl:48px; --sp-section:80px;
```

结构性布局吸附 8/12/16/20/24。卡片内边距 24px，按钮内边距 8–11px × 15–22px。

### 圆角

```css
--r-none:0; --r-xs:5px; --r-sm:8px; --r-md:11px; --r-lg:18px; --r-pill:9999px;
```

### 投影

```css
--sh-product: rgba(0,0,0,0.22) 3px 5px 30px 0; /* 仅产品图,唯一阴影 */
--sh-hairline: 0 0 0 1px rgba(0,0,0,0.08);      /* 卡片用 ring 不用 shadow */
```

## Liquid Glass（2026 新增，WWDC25）

这是 Apple 取代旧 glassmorphism 的新材质系统。在需要"漂浮/磨砂"质感时用：

```css
.liquid-glass {
  background: rgba(255,255,255,0.72);           /* 或暗:rgba(28,28,30,0.72) */
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border: 0.5px solid rgba(255,255,255,0.18);    /* 极细高光边 */
}
```

要点：`saturate(180%)` 不能省（这是"液态"通透感的关键，纯 blur 是死板的）；边是 0.5px 高光而非 1px 实线。用于浮动操作栏、sticky nav、模态背景。

## 组件范式（直接套）

### 按钮
- **主 CTA**：`background:var(--ac-blue); color:#fff; border-radius:pill; padding:11px 22px; font:17px/400`。active 用 `scale(0.95)`。
- **次级 ghost pill**：`background:transparent; border:1px solid var(--ac-blue); color:var(--ac-blue)`。
- **暗色工具按钮**：`background:var(--ink); color:#fff; border-radius:8px; padding:8px 15px; font:14px`。
- **图上圆形控件**：44×44，`background:var(--chip-glass); border-radius:50%`。

### 卡片
- **工具卡**：`background:#fff; border:1px solid var(--hairline); border-radius:18px; padding:24px`。**无阴影**。内部图 1:1 裁切 + 8px 圆角。
- **选中态**：`border:2px solid var(--ac-blue-focus)`，不改背景不加阴影。

### 导航
- **全局 nav**：44px 高，真黑 `#000`，文字 12px。
- **磨砂子 nav**：52px 高，`var(--parchment)` + 80% 透明 + backdrop blur。

### 分隔
- 列表 inset separator：**左侧缩进**（如 56px），0.5px hairline，**不要通栏实线**。

## Do / Don't 速查

**Do**
- 所有交互元素都用 `#0066cc`，没有第二个强调色
- 标题用负字距、weight 600（非 700）
- 正文 17px weight 400 行高 1.47
- 明暗色块交替做分隔（色变即分隔线）
- pill 圆角给所有"动作"语义元素
- 按钮压下用 `scale(0.95)`

**Don't**
- 不要引入第二个品牌色
- 不要给卡片/按钮/文字加阴影（阴影只给产品图）
- 不要装饰性渐变
- 不要用 weight 500
- 不要给正文用 16px
- 不要在 pill/8/11/18 之外用中间圆角值
- 不要在明面用 `#2997ff`（那是暗面专用）

## 工作流

1. **先读需求**：确认要做什么组件/页面、明面还是暗面、是否需要 Liquid Glass。
2. **套 token**：颜色/字体/间距/圆角全部引用上面的 CSS 变量，**禁止内联 hex**（除非来自 token）。
3. **按铁律自检**：交付前对照"核心铁律 10 条"逐条检查——只有强调色单一、字重无 500、正文 17px、卡片无阴影、标题负字距、scale(0.95) 等。
4. **交付 HTML/TSX**：优先交付可在浏览器直接打开验证的 HTML mockup，确认视觉后再迁到目标框架。

## 进阶参考

如需完整组件库规范（store-utility-card / configurator-chip / floating-sticky-bar 等逐字段的 YAML）或响应式断点细节，读 `references/apple-design-system.md`。
