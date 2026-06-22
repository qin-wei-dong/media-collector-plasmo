import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getTimeBucket, TIME_ORDER } from "./design-tokens"

describe("getTimeBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // 本地时间 2026-06-22 12:00(月从 0 起,5 = 6 月)
    vi.setSystemTime(new Date(2026, 5, 22, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // 相对 now 的偏移生成 ISO,避免时区硬编码
  const iso = (offsetMs: number) => new Date(Date.now() - offsetMs).toISOString()

  it("今天", () => {
    expect(getTimeBucket(iso(0))).toBe("今天") // 现在
    expect(getTimeBucket(iso(3600_000))).toBe("今天") // 1 小时前
  })

  it("昨天", () => {
    // 12:00 往前 25 小时 = 前一天 11:00,落在昨天
    expect(getTimeBucket(iso(25 * 3600_000))).toBe("昨天")
  })

  it("本周", () => {
    expect(getTimeBucket(iso(3 * 86400_000))).toBe("本周")
  })

  it("更早", () => {
    expect(getTimeBucket(iso(30 * 86400_000))).toBe("更早") // 30 天前
  })

  it("TIME_ORDER 顺序", () => {
    expect(TIME_ORDER).toEqual(["今天", "昨天", "本周", "更早"])
  })
})
