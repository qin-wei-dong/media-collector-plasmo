import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isUnsafePath, waitForDownloadCompletion } from "./download"

type Listener = (delta: { id?: number; state?: { current?: string } }) => void

let listeners: Listener[] = []
let searchResult: Array<{ state?: string }> = []
let searchError: string | undefined

beforeEach(() => {
  listeners = []
  searchResult = []
  searchError = undefined

  const chromeAny = globalThis as any
  chromeAny.chrome.runtime.lastError = undefined
  chromeAny.chrome.downloads = {
    onChanged: {
      addListener: (fn: Listener) => {
        listeners.push(fn)
      },
      removeListener: (fn: Listener) => {
        listeners = listeners.filter((listener) => listener !== fn)
      },
    },
    search: (_query: { id: number }, cb: (items: Array<{ state?: string }>) => void) => {
      chromeAny.chrome.runtime.lastError = searchError ? { message: searchError } : undefined
      cb(searchResult)
      chromeAny.chrome.runtime.lastError = undefined
    },
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe("isUnsafePath", () => {
  it("拒绝 Unix 绝对路径", () => {
    expect(isUnsafePath("/etc/passwd")).toBe(true)
  })

  it("拒绝反斜杠开头的绝对路径", () => {
    expect(isUnsafePath("\\windows\\system32")).toBe(true)
  })

  it("拒绝 Windows 盘符绝对路径", () => {
    expect(isUnsafePath("C:\\Users\\x")).toBe(true)
    expect(isUnsafePath("D:/path/file")).toBe(true)
  })

  it("拒绝 . 和 .. 路径段", () => {
    expect(isUnsafePath("a/./b")).toBe(true)
    expect(isUnsafePath("a/../b")).toBe(true)
    expect(isUnsafePath("../secret")).toBe(true)
    expect(isUnsafePath("a/b/..")).toBe(true)
  })

  it("放行合法相对路径", () => {
    expect(isUnsafePath("a/b.jpg")).toBe(false)
    expect(isUnsafePath("folder/sub/name.ext")).toBe(false)
    expect(isUnsafePath("单层文件.jpg")).toBe(false)
  })

  it("不误伤名字含 .. 的合法文件名", () => {
    expect(isUnsafePath("5..2促销.jpg")).toBe(false)
    expect(isUnsafePath("v1..0/release.mp4")).toBe(false)
  })
})

describe("waitForDownloadCompletion", () => {
  it("onChanged complete → resolve", async () => {
    const promise = waitForDownloadCompletion(11, 1000)
    const assertion = expect(promise).resolves.toBeUndefined()
    listeners[0]?.({ id: 11, state: { current: "complete" } })
    await assertion
  })

  it("onChanged interrupted → reject", async () => {
    const promise = waitForDownloadCompletion(12, 1000)
    const assertion = expect(promise).rejects.toThrow("下载中断")
    listeners[0]?.({ id: 12, state: { current: "interrupted" } })
    await assertion
  })

  it("timeout 后搜索 complete → resolve", async () => {
    vi.useFakeTimers()
    searchResult = [{ state: "complete" }]
    const promise = waitForDownloadCompletion(13, 20)
    const assertion = expect(promise).resolves.toBeUndefined()

    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it("timeout 后搜索 interrupted → reject", async () => {
    vi.useFakeTimers()
    searchResult = [{ state: "interrupted" }]
    const promise = waitForDownloadCompletion(14, 20)
    const assertion = expect(promise).rejects.toThrow("下载中断")

    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it("timeout 后仍在下载 → reject 下载超时", async () => {
    vi.useFakeTimers()
    searchResult = [{ state: "in_progress" }]
    const promise = waitForDownloadCompletion(15, 20)
    const assertion = expect(promise).rejects.toThrow("下载超时,请在导出历史中重试")

    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it("search lastError → reject 真实错误", async () => {
    vi.useFakeTimers()
    searchError = "search failed"
    const promise = waitForDownloadCompletion(16, 20)
    const assertion = expect(promise).rejects.toThrow("search failed")

    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })
})
