export interface CapsuleRect {
  top: number
  height: number
  right: number
  width: number
}

export interface HeaderMetrics {
  /** 状态栏像素高度。0 表示由 CSS safe-area 接管 */
  statusBarHeight: number
  /** 右侧需要让出的像素（避开微信胶囊 + safe-area）。0 表示不需要避让 */
  capsuleRightGap: number
  /** 整个 header 高度（statusBar + 内容 + paddingBottom），下游定位用 */
  totalHeight: number
}

const FALLBACK_STATUS_BAR_HEIGHT = 20
const FALLBACK_CAPSULE_RIGHT_GAP = 16
const HEADER_PADDING_BOTTOM = 8

export function computeHeaderMetrics(input: {
  isWeapp: boolean
  systemInfo?: { statusBarHeight?: number; windowWidth?: number }
  capsule?: Partial<CapsuleRect>
}): HeaderMetrics {
  // 非 WEAPP：交给 CSS safe-area 处理
  if (!input.isWeapp) {
    return { statusBarHeight: 0, capsuleRightGap: 0, totalHeight: 0 }
  }

  const rawStatusBar = input.systemInfo?.statusBarHeight
  const windowWidth = input.systemInfo?.windowWidth
  const capsuleRight = input.capsule?.right

  // statusBarHeight=0 视为降级场景（IDE 模拟器、未知机型），完全由 CSS safe-area 接管
  if (rawStatusBar === 0) {
    return { statusBarHeight: 0, capsuleRightGap: 0, totalHeight: HEADER_PADDING_BOTTOM }
  }

  const statusBarHeight =
    typeof rawStatusBar === 'number' && rawStatusBar > 0
      ? rawStatusBar
      : FALLBACK_STATUS_BAR_HEIGHT

  // 异常输入：capsule.right 超过 windowWidth。视为几何不可信,让 CSS safe-area 接管
  if (
    typeof windowWidth === 'number' &&
    typeof capsuleRight === 'number' &&
    capsuleRight > windowWidth
  ) {
    return {
      statusBarHeight,
      capsuleRightGap: 0,
      totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
    }
  }

  // 关键信息缺失（windowWidth 缺、capsule 缺），走 fallback
  const hasFullGeometry =
    typeof windowWidth === 'number' && typeof capsuleRight === 'number'

  if (!hasFullGeometry) {
    return {
      statusBarHeight,
      capsuleRightGap: FALLBACK_CAPSULE_RIGHT_GAP,
      totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
    }
  }

  const capsuleRightGap = windowWidth - capsuleRight
  return {
    statusBarHeight,
    capsuleRightGap,
    totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
  }
}
