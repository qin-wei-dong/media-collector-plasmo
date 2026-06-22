import { beforeEach, describe, expect, it } from "vitest"
import { getNoteMediaFromState } from "./xhs-image-extractor"

const NOTES_KEY = "__mc_notes__"
const STATE_KEY = "__mc_state__"

let ls: Record<string, string>

beforeEach(() => {
  ls = {}
  // getNoteMediaFromState 只读 localStorage.getItem + window.__INITIAL_STATE__
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => ls[k] ?? null,
  }
  ;(globalThis as any).window = { __INITIAL_STATE__: undefined }
})

const setNotes = (cache: Record<string, unknown>) => {
  ls[NOTES_KEY] = JSON.stringify(cache)
}
const setStateLs = (state: unknown) => {
  ls[STATE_KEY] = JSON.stringify(state)
}
const setWindowState = (state: unknown) => {
  ;(globalThis as any).window.__INITIAL_STATE__ = state
}

describe("getNoteMediaFromState", () => {
  const noteId = "abc123def456abc123def45" // 24 hex(匹配 XHS noteId 格式)

  it("通路1 命中(__mc_notes__[noteId]) → 返回 cache, 不查 state", () => {
    const cached = {
      type: "image",
      images: [{ url: "http://x/1.jpg" }],
      videoUrl: null,
      title: "缓存标题",
      author: "缓存作者",
    }
    setNotes({ [noteId]: cached })
    // 即使 state 也有数据,通路1 必须优先
    setWindowState({
      note: { noteDetailMap: { [noteId]: { note: { title: "state标题" } } } },
    })
    expect(getNoteMediaFromState(noteId)).toEqual(cached)
  })

  it("通路1 miss → 通路2 window.__INITIAL_STATE__ 精确匹配(图集)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: "图集笔记",
              user: { nickname: "小红" },
              imageList: [
                {
                  url: "http://x/1.jpg?imageView2/0",
                  infoList: [{ url: "http://x/1.jpg", width: 100, height: 200 }],
                },
              ],
            },
          },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.type).toBe("image")
    expect(r?.title).toBe("图集笔记")
    expect(r?.author).toBe("小红")
    expect(r?.images).toHaveLength(1)
    expect(r?.images[0].url).toBe("http://x/1.jpg") // 去掉 ?imageView2 后缀
    expect(r?.images[0].width).toBe(100)
    expect(r?.videoUrl).toBeNull()
  })

  it("通路1 miss → 通路2 localStorage.__mc_state__ 兜底(无 window state)", () => {
    setNotes({})
    // window.__INITIAL_STATE__ 保持 undefined
    setStateLs({
      note: {
        noteDetailMap: {
          [noteId]: { note: { title: "ls state 标题", imageList: [{ url: "http://x/2.jpg" }] } },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.title).toBe("ls state 标题")
    expect(r?.images[0].url).toBe("http://x/2.jpg")
  })

  it("单条兜底(map 只 1 条, noteId 不符仍取)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          someOtherId: { note: { title: "唯一笔记", imageList: [{ url: "http://x/3.jpg" }] } },
        },
      },
    })
    const r = getNoteMediaFromState(noteId) // noteId 不匹配,但 map 只 1 条 → 兜底
    expect(r?.title).toBe("唯一笔记")
  })

  it("多笔记 noteId 不匹配 → null(不猜测, 坑1 命脉)", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          idA: { note: { title: "A", imageList: [{ url: "http://x/a.jpg" }] } },
          idB: { note: { title: "B", imageList: [{ url: "http://x/b.jpg" }] } },
        },
      },
    })
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })

  it("视频笔记: videoUrl 提取, type=video", () => {
    setNotes({})
    setWindowState({
      note: {
        noteDetailMap: {
          [noteId]: {
            note: {
              title: "视频笔记",
              user: { nickname: "up主" },
              video: {
                media: { stream: { h264: [{ masterUrl: "http://x/v.mp4" }] } },
                // cover 候选:非视频 URL,命中 image/webpic 评分
                coverUrl: "http://sns-webpic.xhscdn.com/cover.jpg",
                firstFrame: "http://x/firstframe.jpg",
              },
            },
          },
        },
      },
    })
    const r = getNoteMediaFromState(noteId)
    expect(r?.type).toBe("video")
    expect(r?.videoUrl).toBe("http://x/v.mp4")
    expect(r?.images).toEqual([])
    expect(r?.author).toBe("up主")
    // coverUrl 经 extractCoverUrlFromVideoObj 递归 scoreCoverUrl 提取,这里只验证非空
    expect(typeof r?.coverUrl).toBe("string")
    expect((r?.coverUrl || "").length).toBeGreaterThan(0)
  })

  it("全 miss(无 notes, window state map 空) → null", () => {
    setNotes({})
    setWindowState({ note: { noteDetailMap: {} } })
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })

  it("__mc_state__ 为非法 JSON → 不抛, 回退 null(getState try/catch)", () => {
    setNotes({})
    ls[STATE_KEY] = "{invalid json"
    // window 无 state → getState 走 localStorage,JSON.parse 抛 → catch → null
    expect(getNoteMediaFromState(noteId)).toBeNull()
  })
})
