import { describe, expect, it } from "vitest"
import { isUnsafePath } from "./download"

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
