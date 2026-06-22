// components/CollectionDialog.tsx — 收藏夹 dialog(从 tabs/library.tsx 迁出)
import { useEffect, useMemo, useState } from "react"
import type { Collection, DialogState } from "../types"
import { makeStyles } from "../lib/library-styles"
import { useTheme } from "../lib/use-theme"

export function CollectionDialog({
  dialog,
  collections,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onAssign,
}: {
  dialog: Exclude<DialogState, null>
  collections: Collection[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
  // M6 Task 5:rename dialog 改"编辑收藏夹",一次保存 name + color + pinned
  onUpdate: (collection: Collection, next: { name: string; color: string; pinned: boolean }) => void
  onDelete: (collection: Collection) => void
  onAssign: (collection: Collection) => void
}) {
  const theme = useTheme()
  const styles = useMemo(() => makeStyles(theme), [theme])
  const colorOptions = [
    "#FF5A5F",
    "#5AC8FA",
    "#FFD60A",
    "#AF52DE",
    theme.xhs,
  ]
  const [name, setName] = useState(dialog.type === "rename" ? dialog.collection.name : "")
  const [color, setColor] = useState(dialog.type === "rename" ? dialog.collection.color : colorOptions[0])
  // M6 Task 5:置顶状态(仅 rename 模式有意义)
  const [pinned, setPinned] = useState(
    dialog.type === "rename" ? dialog.collection.pinned ?? false : false
  )

  // 对话框每次打开/切换类型时都重置内部表单状态,避免残留上一次编辑内容
  useEffect(() => {
    setName(dialog.type === "rename" ? dialog.collection.name : "")
    setColor(dialog.type === "rename" ? dialog.collection.color : colorOptions[0])
    setPinned(dialog.type === "rename" ? dialog.collection.pinned ?? false : false)
  }, [dialog, colorOptions])

  // M5 Task 4:对话框打开时,Enter/Esc 快捷键 — capture 阶段拦截,避免与库页 keyboard handler 重复触发
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation()
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === "Enter" && (dialog.type === "create" || dialog.type === "rename")) {
        // 避免在 textarea / 颜色按钮激活时误触,只响应普通 input
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === "INPUT") {
          e.preventDefault()
          if (dialog.type === "create") onCreate(name, color)
          else onUpdate(dialog.collection, { name, color, pinned })
        }
      }
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [dialog, name, color, pinned, onClose, onCreate, onUpdate])

  const title =
    dialog.type === "create"
      ? "新建收藏夹"
      : dialog.type === "rename"
        ? "编辑收藏夹"
        : dialog.type === "delete"
          ? "删除收藏夹"
          : "加入收藏夹"

  return (
    <div style={styles.dialogOverlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.dialogHead}>
          <div style={styles.dialogTitle}>{title}</div>
          <button style={styles.dialogClose} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {(dialog.type === "create" || dialog.type === "rename") && (
          <>
            <input
              style={styles.dialogInput}
              placeholder="收藏夹名称"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <div style={styles.colorGrid}>
              {colorOptions.map((option) => (
                <button
                  key={option}
                  style={{
                    ...styles.colorButton,
                    background: option,
                    ...(color === option ? styles.colorButtonActive : {}),
                  }}
                  onClick={() => setColor(option)}
                  aria-label={`选择颜色 ${option}`}
                />
              ))}
            </div>
            {/* M6 Task 5:置顶 toggle — 仅 rename 模式(创建时新 collection 排序按 max+1 自动放最后,无需置顶) */}
            {dialog.type === "rename" && (
              <label style={styles.pinRow}>
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  aria-label="置顶该收藏夹"
                />
                <span>置顶到侧栏最前</span>
              </label>
            )}
            <button
              className="mc-library-button"
              style={styles.dialogPrimary}
              onClick={() => {
                if (dialog.type === "create") onCreate(name, color)
                else onUpdate(dialog.collection, { name, color, pinned })
              }}
            >
              {dialog.type === "create" ? "创建" : "保存"}
            </button>
          </>
        )}

        {dialog.type === "assign" && (
          <div style={styles.collectionList}>
            {collections.length === 0 ? (
              <div style={styles.dialogEmpty}>还没有收藏夹，先新建一个吧</div>
            ) : (
              collections.map((collection) => (
                <button
                  key={collection.id}
                  className="mc-library-button"
                  style={styles.collectionChoice}
                  onClick={() => onAssign(collection)}
                >
                  <span style={{ ...styles.dot, background: collection.color }} />
                  <span>{collection.name}</span>
                </button>
              ))
            )}
          </div>
        )}

        {dialog.type === "delete" && (
          <>
            <div style={styles.dialogBody}>
              删除「{dialog.collection.name}」后，素材不会被删除，只会移出该收藏夹。
            </div>
            <div style={styles.dialogActions}>
              <button className="mc-library-button" style={styles.dialogGhost} onClick={onClose}>取消</button>
              <button className="mc-library-button" style={styles.dialogDanger} onClick={() => onDelete(dialog.collection)}>删除</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
