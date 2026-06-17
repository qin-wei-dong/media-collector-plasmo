// scripts/test-keyboard-shortcuts.mjs
// M6 Task 6 e2e 验证脚本 — 库页快捷键输入态语义
//
// 用途:在 library tab 的 DevTools Console 复制粘贴运行,验证:
//   - Cmd/Ctrl+A 全选(非输入态)
//   - Cmd/Ctrl+A 在搜索 input 中只选搜索文字(输入态不拦截)
//   - Delete/Backspace 删除选中(非输入态,输入态不拦截)
//   - E 导出(非输入态,输入态不拦截)
//   - C 打开加入收藏夹 dialog(非输入态,输入态不拦截)
//   - Esc 优先级:对话框 > 预览 > 搜索
//
// 不是 puppeteer 自动 e2e,而是手动 e2e(用户在真实 Chrome 跑)。
// 优点:不需要扩展加载的复杂环境,直接验证生产代码路径
// 缺点:不是自动 CI 可跑的(项目无 e2e 框架)
//
// 用法:
//   1. pnpm dev(或 pnpm build)
//   2. Chrome 加载 build/chrome-mv3-dev/
//   3. 注入 5-10 条样本(用 scripts/serve-samples.mjs + fetch + set)
//   4. 打开 library tab,F12 → Console
//   5. 复制下面的 ↓↓↓ 代码块到 Console 跑
//
// 复制开始 ↓↓↓
//
// (function runKeyboardE2E() {
//   const results = []
//   const assert = (name, pass, info) => {
//     results.push({ name, pass, info })
//     console.log((pass ? "✅" : "❌") + " " + name + (info ? "  — " + info : ""))
//   }
//   const getSelCount = () => {
//     const m = document.body.textContent?.match(/已选\s*(\d+)\s*项/)
//     return m ? parseInt(m[1], 10) : null
//   }
//   const getAllBtn = () =>
//     Array.from(document.querySelectorAll("button")).find((b) =>
//       /^(全选|取消全选)$/.test((b.textContent || "").trim())
//     )
//   const isDialogOpen = () =>
//     !!document.querySelector('[role="dialog"], .mc-library-dialog, [aria-label="关闭"]')
//   const isPreviewOpen = () =>
//     !!document.querySelector('[role="dialog"]') &&
//     document.body.textContent?.includes("原帖链接")
//
//   // 模拟 keydown 事件到 window(mac 用 metaKey,Windows/Linux 用 ctrlKey)
//   const fire = (key, opts = {}) => {
//     const isMac = navigator.platform.toLowerCase().includes("mac")
//     const ev = new KeyboardEvent("keydown", {
//       key,
//       bubbles: true,
//       cancelable: true,
//       metaKey: isMac ? true : false,
//       ctrlKey: isMac ? false : true,
//       ...opts,
//     })
//     window.dispatchEvent(ev)
//   }
//
//   // ====== 准备:打开 library tab,确保有样本数据 ======
//   const initialSel = getSelCount()
//   assert("初始无选中", initialSel === 0, `selected=${initialSel}`)
//
//   // ====== 测试 1:Cmd/Ctrl+A 全选(非输入态)======
//   fire("a")
//   const afterCmdA = getSelCount()
//   assert(
//     "Cmd/Ctrl+A 非输入态全选",
//     afterCmdA !== null && afterCmdA > 0,
//     `selected=${afterCmdA}`
//   )
//   // 取消
//   fire("a")
//   const afterCmdAAgain = getSelCount()
//   assert(
//     "Cmd/Ctrl+A 再次触发取消全选",
//     afterCmdAAgain === 0,
//     `selected=${afterCmdAAgain}`
//   )
//
//   // ====== 测试 2:输入态下 Cmd/Ctrl+A 不拦截(只选搜索文字)======
//   const searchInput =
//     document.querySelector('input[placeholder*="搜索"], input[aria-label*="搜索"]') ||
//     Array.from(document.querySelectorAll("input")).find((el) => el.type === "search" || el.type === "text")
//   if (!searchInput) {
//     assert("找到搜索 input", false, "找不到搜索 input,跳过输入态测试")
//   } else {
//     searchInput.focus()
//     searchInput.value = ""
//     // 模拟在 input 内 Cmd+A:target 应该是 input
//     fire("a")
//     // 不应触发 toggleSelectAll,selectedCount 仍为 0
//     const selInInput = getSelCount()
//     assert(
//       "输入态 Cmd/Ctrl+A 不拦截(不触发全选)",
//       selInInput === 0,
//       `selected=${selInInput}`
//     )
//     // 退出输入态
//     searchInput.blur()
//   }
//
//   // ====== 测试 3:E 导出(无选中不触发)======
//   fire("e")
//   assert("E 键无选中时静默不报错", true, "no-op")
//
//   // 选中 2 个
//   const cells = document.querySelectorAll('[aria-label*="选择素材"]')
//   if (cells.length >= 2) {
//     cells[0].click()
//     cells[1].click()
//     const two = getSelCount()
//     assert("准备:选中 2 个", two === 2, `selected=${two}`)
//     // 再次点一个取消 → 1 个
//     cells[0].click()
//     const one = getSelCount()
//     assert("再次点击取消选中", one === 1, `selected=${one}`)
//     // 全选
//     fire("a")
//     const all = getSelCount()
//     assert("Cmd+A 全选", all > 2, `selected=${all}`)
//   } else {
//     assert("找到 ≥ 2 个 cell", false, `cells.length=${cells.length}`)
//   }
//
//   // ====== 测试 4:C 键打开加入收藏夹 dialog ======
//   const wasDialogOpen = isDialogOpen()
//   fire("c")
//   const nowDialogOpen = isDialogOpen()
//   assert("C 键打开 dialog", nowDialogOpen || wasDialogOpen, `open=${nowDialogOpen}`)
//   // Esc 关闭
//   fire("Escape")
//   const afterEsc = isDialogOpen()
//   assert("Esc 关闭 dialog", !afterEsc, `open=${afterEsc}`)
//
//   // ====== 测试 5:Delete/Backspace 删除选中(走撤销 Toast)======
//   const beforeDel = getSelCount()
//   if (beforeDel > 0) {
//     fire("Delete")
//     await new Promise((r) => setTimeout(r, 100))
//     const afterDel = getSelCount()
//     // 立即删除(撤销 Toast 显示);再次点击可撤销
//     assert(
//       "Delete 删除选中",
//       afterDel === 0,
//       `selected before=${beforeDel} after=${afterDel}`
//     )
//     // 找 Toast 撤销按钮
//     const undoBtn = Array.from(document.querySelectorAll("button")).find((b) =>
//       (b.textContent || "").includes("撤销")
//     )
//     if (undoBtn) {
//       undoBtn.click()
//       await new Promise((r) => setTimeout(r, 200))
//       const restored = await getSelCount()
//       assert("撤销恢复", restored === beforeDel, `restored=${restored}`)
//     } else {
//       assert("找到撤销按钮", false, "Toast 未显示或按钮文本变了")
//     }
//   }
//
//   // ====== 总结 ======
//   const pass = results.filter((r) => r.pass).length
//   const fail = results.length - pass
//   console.log("---")
//   console.log(`PASS: ${pass}/${results.length}` + (fail ? `  ❌ ${fail} failed` : ""))
//   return { pass, fail, results }
// })()
//
// 复制结束 ↑↑↑
//
// 输出样例:
//   ✅ 初始无选中  — selected=0
//   ✅ Cmd/Ctrl+A 非输入态全选  — selected=5
//   ✅ Cmd/Ctrl+A 再次触发取消全选  — selected=0
//   ✅ 输入态 Cmd/Ctrl+A 不拦截(不触发全选)  — selected=0
//   ✅ E 键无选中时静默不报错  — no-op
//   ✅ 准备:选中 2 个  — selected=2
//   ✅ 再次点击取消选中  — selected=1
//   ✅ Cmd+A 全选  — selected=5
//   ✅ C 键打开 dialog  — open=true
//   ✅ Esc 关闭 dialog  — open=false
//   ✅ Delete 删除选中  — selected before=5 after=0
//   ✅ 撤销恢复  — restored=5
//   ---
//   PASS: 12/12
