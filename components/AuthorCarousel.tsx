// components/AuthorCarousel.tsx — 圆形作者头像横滑入口
import { useState } from "react"
import type { MediaItem } from "../types"
import { theme, getAvatarGradient } from "../popup-theme"

interface AuthorCarouselProps {
  authors: Array<{ name: string; count: number; firstItem: MediaItem }>
  selectedAuthor?: string
  onSelect?: (author: string) => void
  maxVisible?: number
}

export function AuthorCarousel({ authors, selectedAuthor, onSelect, maxVisible = 5 }: AuthorCarouselProps) {
  const [expanded, setExpanded] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(true)
  if (!authors.length) return null

  const visible = expanded ? authors : authors.slice(0, maxVisible)
  const hiddenCount = authors.length - maxVisible

  return (
    <div style={styles.section}>
      <div style={styles.head}>
        <div style={styles.headLeft}>
          <span style={styles.title}>作者</span>
          <span style={styles.badge}>{authors.length} 位</span>
        </div>
        {selectedAuthor && (
          <button style={styles.clearBtn} onClick={() => onSelect?.("")}>
            清除筛选
          </button>
        )}
      </div>
      <div style={styles.carouselWrap}>
        <div 
          style={styles.carousel}
          onScroll={(e) => {
            const target = e.target as HTMLDivElement
            // 滚动超过 10px 后隐藏提示
            setShowScrollHint(target.scrollLeft < 10)
          }}
        >
          {visible.map((a) => {
            const isActive = selectedAuthor === a.name
            return (
            <div
              key={a.name || "__none__"}
              style={{
                ...styles.card,
                ...(isActive ? styles.cardActive : {}),
              }}
              onClick={() => onSelect?.(isActive ? "" : a.name)}
            >
              <div
                style={{
                  ...styles.avatar,
                  ...(isActive ? styles.avatarActive : {}),
                  backgroundImage: a.firstItem.coverUrl
                    ? `url(${a.firstItem.coverUrl})`
                    : getAvatarGradient(a.name),
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <span style={styles.count}>{a.count}</span>
              </div>
              <div style={{
                  ...styles.name,
                  ...(isActive ? styles.nameActive : {}),
                }}>{a.name || "未分类"}</div>
            </div>
          )})}

          {/* 折叠状态下显示「查看全部」入口 */}
          {!expanded && hiddenCount > 0 && (
            <div style={styles.card} onClick={() => setExpanded(true)}>
              <div style={{ ...styles.avatar, ...styles.moreAvatar }}>
                <span style={styles.moreCount}>+{hiddenCount}</span>
              </div>
              <div style={styles.name}>查看全部</div>
            </div>
          )}

          {/* 展开状态下显示「收起」 */}
          {expanded && hiddenCount > 0 && (
            <div style={styles.card} onClick={() => setExpanded(false)}>
              <div style={{ ...styles.avatar, ...styles.moreAvatar }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </div>
              <div style={styles.name}>收起</div>
            </div>
          )}
        </div>
        
        {/* 滚动提示渐变遮罩 */}
        {showScrollHint && !expanded && authors.length > maxVisible && (
          <div style={styles.scrollHint} />
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  section: { padding: "0 0 14px" },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px 8px",
  },
  headLeft: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  title: { fontSize: 17, fontWeight: 700, letterSpacing: "-0.3px", color: theme.textPrimary },
  badge: { 
    fontSize: 11, 
    color: theme.textTertiary, 
    fontWeight: 500,
    background: theme.card,
    padding: "2px 7px",
    borderRadius: 6,
  },
  clearBtn: {
    border: "none",
    background: "rgba(255,255,255,0.1)",
    color: theme.textSecondary,
    fontSize: 11,
    fontWeight: 500,
    padding: "3px 8px",
    borderRadius: 6,
    cursor: "pointer",
    transition: `all ${theme.durFast} ease`,
  },
  carouselWrap: {
    position: "relative",
  },
  carousel: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    padding: "0 16px 4px",
    scrollSnapType: "x mandatory",
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.15) transparent",
  },
  scrollHint: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 4,
    width: 50,
    background: "linear-gradient(to right, transparent, #0a0a0c)",
    pointerEvents: "none",
  },
  card: {
    flex: "0 0 auto",
    width: 64,
    textAlign: "center",
    scrollSnapAlign: "start",
    cursor: "pointer",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    margin: "0 auto",
    boxShadow: theme.shadowCard,
    position: "relative",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    transition: `box-shadow ${theme.durFast} ease`,
  },
  avatarActive: {
    boxShadow: "0 0 0 3px #fff, 0 8px 20px rgba(0,0,0,0.5)",
  },
  moreAvatar: {
    background: theme.cardHover,
    alignItems: "center",
    justifyContent: "center",
  },
  moreCount: {
    fontSize: 14,
    fontWeight: 700,
    color: theme.textSecondary,
  },
  count: {
    position: "absolute",
    bottom: -2,
    right: -2,
    fontSize: 9,
    fontWeight: 700,
    background: "#fff",
    color: "#000",
    padding: "1px 5px",
    borderRadius: 6,
    border: "2px solid #1c1c1e",
  },
  cardActive: {
    opacity: 1,
  },
  name: {
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 6,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nameActive: {
    color: "#fff",
    fontWeight: 600,
  },
}
