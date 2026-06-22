// scripts/test/setup-chrome-storage.ts — vitest 全局 chrome.storage.local mock
// 内存实现 storage.ts 用到的 chrome.storage.local.get/set + chrome.runtime.lastError。
// 每个 it 通过 __resetChromeStorageMock()(beforeEach 调)清空 store 做隔离。
// __getChromeStorageMockData() 供测试同步读回 store 验证顺序/去重。

let store: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    local: {
      // storage.ts 只用到 get(stringKey, cb) 形态
      get: (key: string, cb: (result: Record<string, unknown>) => void) => {
        cb({ [key]: store[key] })
      },
      set: (obj: Record<string, unknown>, cb?: () => void) => {
        Object.assign(store, obj)
        cb?.()
      },
    },
  },
  runtime: {
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
}

;(globalThis as any).chrome = chromeMock

// 测试 helpers
;(globalThis as any).__resetChromeStorageMock = () => {
  store = {}
}
;(globalThis as any).__getChromeStorageMockData = () => store
