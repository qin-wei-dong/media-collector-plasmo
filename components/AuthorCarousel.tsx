// components/AuthorCarousel.tsx — 圆形作者头像横滑入口
import { useEffect, useState } from "react"
import type { MediaItem } from "../types"
import { theme, getAvatarGradient } from "../popup-theme"

interface AuthorCarouselProps {
  authors: Array<{ name: string; count: number; firstItem: MediaItem }>
  selectedAuthor?: string
  onSelect?: (author: string) => void
  maxVisible?: number
}

/** 单个头像的加载状态管理(避免互相干扰) */
function AuthorAvatar({ author, isActive }: { author: { name: string; count: number; firstItem: MediaItem }; isActive: boolean }) {
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgError, setImgError] = useState(false)
  const cover = author.firstItem.coverUrl

  // coverUrl 变化时重置
  useEffect(() => {
    setImgLoaded(false)
    setImgError(false)
  }, [cover])

  const showImage = cover && !imgError

  return (
    <div
      style={{
        ...styles.avatar,
        ...(isActive ? styles.avatarActive : {}),
      }}
    >
      {/* 渐变底色:加载占位 + 失败回退 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "inherit",
          backgroundImage: getAvatarGradient(author.name),
        }}
        aria-hidden="true"
      />
      {/* 封面图:加载完成后淡入 */}
      {showImage && (
        <img
          src={cover}
          alt=""
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "inherit",
            opacity: imgLoaded ? 1 : 0,
            transition: `opacity ${theme.durFast} ${theme.easeOut}`,
          }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
        />
      )}
      <span style={styles.count}>{author.count}</span>
    </div>
  )
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
              <AuthorAvatar author={a} isActive={isActive} />
              <div style={{
                  ...styles.name,
                  ...(isActive ? styles.nameActive : {}),
                }}>{a.name || "未分类"}</div>
            </div>
          )})}

          {/* 折叠状态下显示「查看全部」入口 */}
          {!expanded && hiddenCount > 0 && (
            <div
              style={styles.card}
              onClick={() => setExpanded(true)}
              role="button"
              tabIndex={0}
              aria-label={`查看全部 ${authors.length} 位作者`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setExpanded(true)
                }
              }}
            >
              <div style={{ ...styles.avatar, ...styles.moreAvatar }}>
                <span style={styles.moreCount}>+{hiddenCount}</span>
              </div>
              <div style={styles.name}>查看全部</div>
            </div>
          )}

          {/* 展开状态下显示「收起」 */}
          {expanded && hiddenCount > 0 && (
            <div
              style={styles.card}
              onClick={() => setExpanded(false)}
              role="button"
              tabIndex={0}
              aria-label="收起作者列表"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setExpanded(false)
                }
              }}
            >
              <div style={{ ...styles.avatar, ...styles.moreAvatar }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
  section: { padding: `0 0 ${theme.sp.sm + 2}px` },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `0 ${theme.sp.md}px ${theme.sp.xs}px`,
  },
  headLeft: {
    display: "flex",
    alignItems: "baseline",
    gap: theme.sp.xs,
  },
  title: { fontSize: theme.fs.title, fontWeight: 700, letterSpacing: "-0.3px", color: theme.textPrimary },
  badge: {
    fontSize: theme.fs.micro,
    color: theme.textTertiary,
    fontWeight: 500,
    background: theme.card,
    padding: "2px 7px",
    borderRadius: theme.r.xs,
  },
  clearBtn: {
    border: "none",
    background: "rgba(255,255,255,0.1)",
    color: theme.textSecondary,
    fontSize: theme.fs.micro,
    fontWeight: 500,
    padding: "3px 8px",
    borderRadius: theme.r.xs,
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
    padding: `0 ${theme.sp.md}px ${theme.sp.xxs}px`,
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
    background: `linear-gradient(to right, transparent, ${theme.bg})`,
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
    borderRadius: theme.r.pill,
    margin: "0 auto",
    boxShadow: theme.shadowCard,
    position: "relative",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    transition: `box-shadow ${theme.durFast} ease`,
  },
  avatarActive: {
    boxShadow: `0 0 0 3px ${theme.accent}, 0 8px 20px rgba(0,0,0,0.5)`,
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
    borderRadius: theme.r.xs,
    border: `2px solid ${theme.bgGradient}`,
  },
  cardActive: {
    opacity: 1,
  },
  name: {
    fontSize: theme.fs.micro,
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
