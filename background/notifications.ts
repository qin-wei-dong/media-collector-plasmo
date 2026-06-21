// background/notifications.ts — background service worker notification helpers

// 从 manifest 动态获取扩展图标，避免硬编码 hash
function getIconUrl(): string {
  const icons = chrome.runtime.getManifest().icons as Record<string, string> | undefined
  if (!icons) return ""
  const key = icons["48"] ? "48" : Object.keys(icons)[0]
  return chrome.runtime.getURL(icons[key])
}

export function showNote(title: string, msg: string) {
  chrome.notifications.create(
    {
      type: "basic",
      iconUrl: getIconUrl(),
      title,
      message: msg,
    },
    () => void chrome.runtime.lastError
  )
}
