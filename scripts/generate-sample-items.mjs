// scripts/generate-sample-items.mjs
// 生成模拟素材数据,用于库页大列表性能测试。
// 用法:
//   node scripts/generate-sample-items.mjs 100     → 生成 100 条,输出到 stdout
//   node scripts/generate-sample-items.mjs 500 > sample.json
//
// 注入到 Chrome:
//   1. 打开扩展的 Service Worker DevTools(或 popup DevTools)
//   2. 粘贴生成的 JSON 内容,执行:
//      chrome.storage.local.set({ collected_media: <粘贴的数组> })
//   3. 刷新库页

const count = parseInt(process.argv[2] || "100", 10)
const isJson = process.argv.includes("--json")

// 真实感的作者名和标题模板
const XHS_AUTHORS = ["老王摄影", "美食日记", "设计灵感库", "旅行手记", "日常穿搭", "家居美学", "咖啡探店"]
const DY_AUTHORS = ["搞笑日常", "知识科普", "影视剪辑", "音乐现场", "萌宠乐园", "健身教练"]
const XHS_TITLES = ["城市夜景扫街", "周末brunch", "极简海报设计", "秋日穿搭分享", "租房改造记录", "手冲咖啡教程", "日落延时摄影", "街头人文抓拍", "插画风头像合集", "咖啡店空间设计"]
const DY_TITLES = ["三分钟搞懂经济学", "猫咪搞笑瞬间", "电影经典片段混剪", "指弹吉他翻弹", "在家练出马甲线", "冷知识大挑战", "深夜食堂复刻"]

const COLLECTION_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F"]
const COLLECTION_NAMES = ["灵感", "参考素材", "待整理", "精选", "项目A"]

// 小红书图片 CDN(用 picsum 占位,实际测试图片加载不依赖小红书防盗链)
function imgUrl(seed) {
  return `https://picsum.photos/seed/mc${seed}/800/600`
}

function videoUrl(seed) {
  return `https://picsum.photos/seed/mc${seed}/800/600` // 视频也用占位图(性能测试不关心真实视频)
}

function randHex24() {
  let s = ""
  for (let i = 0; i < 24; i++) s += Math.floor(Math.random() * 16).toString(16)
  return s
}

function randPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// 生成时间戳:分散在过去 30 天内,最近的更多
function randTimestamp() {
  const now = Date.now()
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000
  // 偏向最近的日期(50% 在最近 3 天,30% 在最近一周,20% 更早)
  const r = Math.random()
  let ts
  if (r < 0.5) ts = now - Math.random() * 3 * 24 * 60 * 60 * 1000
  else if (r < 0.8) ts = now - Math.random() * 7 * 24 * 60 * 60 * 1000
  else ts = thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo)
  return new Date(ts).toISOString()
}

// 生成 5 个收藏夹
const collections = COLLECTION_NAMES.map((name, i) => ({
  id: `col_${i + 1}`,
  name,
  color: COLLECTION_COLORS[i % COLLECTION_COLORS.length],
  createdAt: new Date(Date.now() - (5 - i) * 86400000).toISOString(),
  updatedAt: new Date(Date.now() - i * 3600000).toISOString(),
}))

// 预生成一批 noteId,模拟图集(同一 noteId 下 3-9 张图)
const noteIds = []
const noteGroupSizes = new Map()
for (let i = 0; i < Math.floor(count / 5); i++) {
  const nid = randHex24()
  const groupSize = randInt(3, 9)
  noteIds.push(nid)
  noteGroupSizes.set(nid, groupSize)
}

const items = []
let noteIdx = 0

for (let i = 0; i < count; i++) {
  const isVideo = Math.random() < 0.25 // 25% 视频
  const isXhs = Math.random() < 0.65 // 65% 小红书
  const platform = isXhs ? "xiaohongshu" : "douyin"
  const author = isXhs ? randPick(XHS_AUTHORS) : randPick(DY_AUTHORS)
  const title = isXhs ? randPick(XHS_TITLES) : randPick(DY_TITLES)
  const seed = `${i}_${randHex24().slice(0, 6)}`

  // 图集:每 4 条取一个 noteId,连续 groupIndex
  let noteId, groupIndex
  if (!isVideo && Math.random() < 0.4) {
    noteId = noteIds[noteIdx % noteIds.length]
    const size = noteGroupSizes.get(noteId)
    groupIndex = randInt(0, size - 1)
    if (Math.random() < 0.3) noteIdx++ // 偶尔切换到下一个图集
  }

  // 收藏夹归属:40% 的素材属于某个收藏夹
  let collectionIds
  if (Math.random() < 0.4) {
    const colCount = Math.random() < 0.8 ? 1 : 2
    collectionIds = []
    for (let c = 0; c < colCount; c++) {
      const col = randPick(collections)
      if (!collectionIds.includes(col.id)) collectionIds.push(col.id)
    }
  }

  // 30% 已导出
  const exportedAt = Math.random() < 0.3 ? new Date(Date.now() - randInt(1, 14) * 86400000).toISOString() : undefined

  items.push({
    id: `item_${i + 1}_${randHex24().slice(0, 6)}`,
    url: isVideo ? videoUrl(seed) : imgUrl(seed),
    type: isVideo ? "video" : "image",
    platform,
    title: `${title}${noteId !== undefined ? ` ${groupIndex + 1}` : ""}`,
    sourceUrl: isXhs ? `https://www.xiaohongshu.com/explore/${noteId || randHex24()}` : `https://www.douyin.com/video/${randHex24()}`,
    collectedAt: randTimestamp(),
    coverUrl: imgUrl(seed),
    author,
    width: randInt(800, 1920),
    height: randInt(600, 1350),
    noteId,
    groupIndex,
    collectionIds,
    exportedAt,
  })
}

// 输出:items JSON + 注入命令 + collections 注入命令
if (isJson) {
  // --json 模式:输出纯 JSON,供 fetch + r.json() 注入用
  console.log(JSON.stringify({ items, collections }))
} else {
  // 默认:输出可粘贴 DevTools 的 JS 脚本(带注释)
  console.log("// ===== 素材数据(" + count + " 条)=====")
  console.log("// 复制下面两行到 Service Worker DevTools Console 执行:\n")
  console.log("chrome.storage.local.set({ collected_media: " + JSON.stringify(items, null, 0) + " })")
  console.log("chrome.storage.local.set({ collections: " + JSON.stringify(collections, null, 0) + " })")
  console.log("\n// 执行后刷新库页(popup 或 library tab)即可看到样本数据。")
}

// stderr 输出统计信息(不干扰 stdout 的 JSON)
console.error(`生成完成: ${items.length} 条素材`)
console.error(`  图片: ${items.filter((i) => i.type === "image").length}`)
console.error(`  视频: ${items.filter((i) => i.type === "video").length}`)
console.error(`  小红书: ${items.filter((i) => i.platform === "xiaohongshu").length}`)
console.error(`  抖音: ${items.filter((i) => i.platform === "douyin").length}`)
console.error(`  图集(有 noteId): ${items.filter((i) => i.noteId).length}`)
console.error(`  收藏夹: ${collections.length} 个`)
console.error(`  已导出: ${items.filter((i) => i.exportedAt).length}`)
