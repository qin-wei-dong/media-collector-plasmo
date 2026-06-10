// contents/xiaohongshu.ts — 小红书：单图采集 + 多图笔记提取
import type { PlasmoCSConfig } from "plasmo"
import { injectStyles, HoverUIManager, showToast, extractTitle } from "./base"

export const config: PlasmoCSConfig = {
  matches: ["https://www.xiaohongshu.com/*"],
  run_at: "document_idle",
}

// ====== 小红书笔记多图提取 ======
interface XHSImage {
  url: string
  width?: number
  height?: number
}

function extractXHSNoteImages(): XHSImage[] {
  const state = (window as any).__INITIAL_STATE__
  if (!state?.note) return []

  const noteId =
    location.pathname.split("/").pop() ||
    Object.keys(state.note.noteDetailMap || {})[0] ||
    ""

  const note =
    state.note.noteDetailMap?.[noteId]?.note ||
    state.note.noteDetailMap?.[Object.keys(state.note.noteDetailMap)[0]]?.note

  if (!note?.imageList) return []

  return note.imageList.map((img: any) => ({
    url: String(img.url || "").replace(/\?imageView2.*$/, ""),
    width: img.width,
    height: img.height,
  }))
}

function isNoteDetailPage(): boolean {
  const path = location.pathname
  return path.includes("/explore/") || path.includes("/discovery/item/")
}

function getNoteId(): string {
  return location.pathname.split("/").pop() || ""
}

// ====== 主逻辑 ======
function main() {
  console.log("🔍 素材采集助手已激活 [xiaohongshu]")

  injectStyles()

  const ui = new HoverUIManager({
    onCollect: (media) => {
      if (isNoteDetailPage()) {
        const images = extractXHSNoteImages()
        if (images.length > 1) {
          // 多图笔记：弹出选择
          showSelectModal(media, images)
          return
        }
      }

      // 单图采集
      doCollect(media.url, media.type)
    },
  })

  function doCollect(
    url: string,
    type: string,
    noteId?: string,
    groupIndex?: number,
    width?: number,
    height?: number
  ) {
    ui.showCollected()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_MEDIA",
        payload: {
          url,
          type,
          platform: "xiaohongshu",
          title: extractTitle(),
          sourceUrl: location.href,
          noteId,
          groupIndex,
          width,
          height,
        },
      },
      (resp) => {
        if (resp?.success) {
          ui.markDone()
          showToast("✅ 素材已采集")
        } else {
          ui.resetCollectState()
          showToast(resp?.error || "采集失败")
        }
      }
    )
  }

  function doCollectNoteImages(images: XHSImage[]) {
    const noteId = getNoteId()
    chrome.runtime.sendMessage(
      {
        type: "COLLECT_NOTE_IMAGES",
        payload: {
          noteId,
          images: images.map((img, i) => ({
            url: img.url,
            width: img.width,
            height: img.height,
            groupIndex: i,
          })),
          title: extractTitle(),
          sourceUrl: location.href,
        },
      },
      (resp) => {
        if (resp?.success) {
          showToast(`✅ 已采集笔记全部 ${images.length} 张图片`)
        } else {
          showToast(resp?.error || "笔记采集失败")
        }
        removeSelectModal()
      }
    )
  }

  // ====== 选择弹窗 ======
  let selectModal: HTMLDivElement | null = null

  function showSelectModal(
    currentMedia: { url: string; type: string; el: Element },
    images: XHSImage[]
  ) {
    removeSelectModal()

    selectModal = document.createElement("div")
    selectModal.id = "__mc_select_modal"
    selectModal.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:8px;color:#333;">📸 笔记包含 ${images.length} 张图片</div>
      <div style="display:flex;gap:8px;margin-bottom:10px;overflow-x:auto;padding-bottom:4px;">
        ${images.slice(0, 5).map((img, i) => `
          <div style="flex-shrink:0;width:56px;height:56px;border-radius:6px;overflow:hidden;border:2px solid ${img.url === currentMedia.url ? '#ff2d55' : '#eee'};">
            <img src="${img.url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display='none'" />
          </div>
        `).join("")}
        ${images.length > 5 ? `<div style="flex-shrink:0;width:56px;height:56px;border-radius:6px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:12px;color:#999;">+${images.length - 5}</div>` : ""}
      </div>
      <button id="__mc_single_btn" style="width:100%;padding:8px;margin-bottom:6px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:13px;cursor:pointer;font-family:inherit;">🖼️ 仅采集当前图片</button>
      <button id="__mc_all_btn" style="width:100%;padding:8px;border:none;border-radius:8px;background:linear-gradient(135deg,#ff2d55,#ff6b81);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">📚 采集全部 ${images.length} 张图片</button>
    `

    const rect = currentMedia.el.getBoundingClientRect()
    let top = rect.bottom + 8
    let left = rect.left + rect.width / 2 - 120
    if (left < 8) left = 8
    if (top + 200 > window.innerHeight) top = rect.top - 210

    selectModal.style.left = left + "px"
    selectModal.style.top = top + "px"
    document.body.appendChild(selectModal)

    // 延迟显示触发动画
    requestAnimationFrame(() => selectModal!.classList.add("mc_on"))

    // 事件
    selectModal.querySelector("#__mc_single_btn")!.addEventListener("click", (e) => {
      e.stopPropagation()
      const currentIdx = images.findIndex((img) => img.url === currentMedia.url)
      doCollect(currentMedia.url, currentMedia.type, getNoteId(), Math.max(0, currentIdx), images[currentIdx]?.width, images[currentIdx]?.height)
      removeSelectModal()
    })

    selectModal.querySelector("#__mc_all_btn")!.addEventListener("click", (e) => {
      e.stopPropagation()
      doCollectNoteImages(images)
    })

    // 点击外部关闭
    const handleOutsideClick = (e: MouseEvent) => {
      if (selectModal && !selectModal.contains(e.target as Node)) {
        removeSelectModal()
        document.removeEventListener("click", handleOutsideClick)
      }
    }
    setTimeout(() => document.addEventListener("click", handleOutsideClick), 100)
  }

  function removeSelectModal() {
    if (selectModal) {
      selectModal.classList.remove("mc_on")
      setTimeout(() => {
        selectModal?.remove()
        selectModal = null
      }, 150)
    }
  }

  // ====== 响应后台消息 ======
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "GET_LAST_MEDIA") {
      const media = ui.lastMedia
        ? {
            url: ui.lastMedia.url,
            type: ui.lastMedia.type,
            platform: "xiaohongshu",
            title: extractTitle(),
            sourceUrl: location.href,
          }
        : null
      sendResponse({ success: true, media })
    }
    return true
  })

  console.log("✅ 小红书就绪 — 悬停图片采集 / 笔记详情页全部采集")
}

main()
