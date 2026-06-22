import { beforeEach, describe, expect, it, vi } from "vitest"
import { stateInjector } from "./xhs-state-inject"

const NOTES_KEY = "__mc_notes__"

let store: Record<string, string>
let nextFetchJson: unknown

function makeNote(id: string, title = `标题-${id}`) {
  return {
    note_id: id,
    title,
    image_list: [{ url: `https://img.example.com/${id}.jpg` }],
  }
}

function flushMicrotasks() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  store = {}
  nextFetchJson = null

  const localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
  }

  const fakeFetch = vi.fn(() =>
    Promise.resolve({
      headers: {
        get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null),
      },
      clone: () => ({
        json: () => Promise.resolve(nextFetchJson),
      }),
    })
  )

  class FakeXHR {
    responseText = ""
    __mcUrl = ""
    private listeners: Record<string, Array<() => void>> = {}

    addEventListener(type: string, cb: () => void) {
      this.listeners[type] ||= []
      this.listeners[type].push(cb)
    }

    getResponseHeader(name: string) {
      return name.toLowerCase() === "content-type" ? "application/json" : null
    }

    open() {}

    send() {
      return undefined
    }
  }

  ;(globalThis as any).store = store
  ;(globalThis as any).localStorage = localStorage
  ;(globalThis as any).window = {
    __INITIAL_STATE__: undefined,
    fetch: fakeFetch,
  }
  ;(globalThis as any).XMLHttpRequest = FakeXHR
})

describe("stateInjector", () => {
  it("更新已有 note 会刷新 key 顺序,并保留最近 150 条", async () => {
    const cached: Record<string, unknown> = {}
    for (let i = 1; i <= 201; i++) {
      const id = String(i).padStart(24, "0")
      cached[id] = {
        type: "image",
        images: [{ url: `https://img.example.com/${id}.jpg` }],
        videoUrl: null,
        title: `旧标题-${id}`,
        author: "旧作者",
      }
    }
    store[NOTES_KEY] = JSON.stringify(cached)

    const hotId = String(10).padStart(24, "0")
    const newId = String(202).padStart(24, "0")
    nextFetchJson = { items: [makeNote(hotId, "刷新过的旧笔记"), makeNote(newId, "新增笔记")] }

    stateInjector()
    await (globalThis as any).window.fetch("https://www.xiaohongshu.com/api/mock")
    await flushMicrotasks()

    const nextCache = JSON.parse(store[NOTES_KEY] || "{}") as Record<string, unknown>
    const keys = Object.keys(nextCache)

    expect(keys).toHaveLength(150)
    expect(keys).toContain(hotId)
    expect(keys).toContain(newId)
    expect(keys[keys.length - 2]).toBe(hotId)
    expect(keys[keys.length - 1]).toBe(newId)
    expect(keys).not.toContain(String(1).padStart(24, "0"))
  })
})
