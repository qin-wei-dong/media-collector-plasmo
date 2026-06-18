# Release Checklist

## Build

- [ ] `pnpm build` exits 0.
- [ ] `pnpm package` exits 0.
- [ ] `pnpm audit:a11y` exits 0.
- [ ] `build/chrome-mv3-prod.zip` exists.

## Manifest

- [ ] `host_permissions` only includes `https://www.xiaohongshu.com/*`.
- [ ] No Douyin content script exists in the production build.
- [ ] Extension action click opens or focuses `tabs/library.html`.

## Chrome Manual Validation

- [ ] Install `build/chrome-mv3-prod` via `chrome://extensions`.
- [ ] Click extension icon and confirm the full-screen library opens.
- [ ] Open a Xiaohongshu note in feed modal and collect image note.
- [ ] Open a Xiaohongshu note detail page and collect image note.
- [ ] Collect a Xiaohongshu video note.
- [ ] Search by title or author in library.
- [ ] Filter by type: image / video.
- [ ] Preview image and video.
- [ ] Select all current filtered results.
- [ ] Cancel select all.
- [ ] Create collection.
- [ ] Rename collection.
- [ ] Change collection color.
- [ ] Pin collection.
- [ ] Move selected items to another collection.
- [ ] Remove items from current collection.
- [ ] Delete selected items.
- [ ] Undo deletion from Toast.
- [ ] Batch export selected items.
- [ ] Open export history.
- [ ] Retry failed export item if any failure is available.
- [ ] Load 500 sample items and confirm the library does not white-screen.
- [ ] Confirm progressive render counter and load-more behavior.

## Store Listing

- [ ] Title matches `素材采集助手 - 小红书素材管理`.
- [ ] Short description does not promise Douyin.
- [ ] Long description says Douyin is not current release scope.
- [ ] Permission explanations match manifest.
- [ ] Privacy statement says no login, no upload, no payment collection.

## Release Decision

- [ ] README, CHANGELOG, AGENTS are updated.
- [ ] Chrome Web Store listing draft reviewed.
- [ ] Privacy draft reviewed.
- [ ] User has approved release candidate.
