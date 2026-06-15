/**
 * H5 笔记正文选区纯函数(无 DOM 依赖)
 * 文档见 docs/superpowers/specs/2026-06-15-note-markdown-highlight-design.md
 */

export const SELECTION_CONTEXT_LIMIT = 32
const TOOLBAR_GAP = 8
const DEFAULT_MARGIN = 8

export interface TextRange {
  startOffset: number
  endOffset: number
}

export interface SelectionAnchorPayload extends TextRange {
  selectedText: string
  prefixText: string
  suffixText: string
}

export interface ClampToolbarInput {
  selectionLeft: number
  selectionTop: number
  selectionBottom: number
  /** 当前选区的可视宽度(由 range.getBoundingClientRect().width 提供) */
  selectionWidth?: number
  toolbarWidth: number
  toolbarHeight: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}

/**
 * 给定正文纯文本和 [start, end) 偏移,产出包含 32 字符前后文 + 选中文字的 anchor payload。
 * - 选区为空、纯空白或越界 → null
 * - 偏移顺序相反 → null
 */
export function buildSelectionAnchor(
  fullText: string,
  startOffset: number,
  endOffset: number,
): SelectionAnchorPayload | null {
  if (
    typeof startOffset !== 'number' ||
    typeof endOffset !== 'number' ||
    !Number.isFinite(startOffset) ||
    !Number.isFinite(endOffset)
  ) {
    return null
  }
  if (endOffset <= startOffset) return null
  if (startOffset < 0 || endOffset > fullText.length) return null
  const selectedText = fullText.slice(startOffset, endOffset)
  if (!selectedText.trim()) return null
  return {
    startOffset,
    endOffset,
    selectedText,
    prefixText: fullText.slice(
      Math.max(0, startOffset - SELECTION_CONTEXT_LIMIT),
      startOffset,
    ),
    suffixText: fullText.slice(
      endOffset,
      Math.min(fullText.length, endOffset + SELECTION_CONTEXT_LIMIT),
    ),
  }
}

/**
 * 给定一个候选 range 和已有 highlights 列表,判断是否与任一重叠
 * (boundary-touching = 非重叠,与 design spec 一致)。
 */
export function overlapsAny(range: TextRange, highlights: TextRange[]): boolean {
  for (const h of highlights) {
    if (range.startOffset < h.endOffset && h.startOffset < range.endOffset) {
      return true
    }
  }
  return false
}

/**
 * 把工具条摆在选区正上方(首选)或正下方,水平居中并夹在视口 margin 内。
 *
 * selectionLeft/Top/Bottom 来自 range.getBoundingClientRect(),toolbarWidth/Height 是工具条布局尺寸。
 */
export function clampToolbarPosition(input: ClampToolbarInput): {
  left: number
  top: number
} {
  const margin = input.margin ?? DEFAULT_MARGIN
  const selectionWidth = input.selectionWidth ?? 0

  // 水平: 选区中心 - 工具条半宽,再夹到 [margin, viewportWidth - toolbarWidth - margin]
  const centerX = input.selectionLeft + selectionWidth / 2
  const desiredLeft = centerX - input.toolbarWidth / 2
  const maxLeft = Math.max(margin, input.viewportWidth - input.toolbarWidth - margin)
  const left = Math.min(Math.max(desiredLeft, margin), maxLeft)

  // 垂直: 上方(选区上沿 - 工具条高度 - 8) 优先;若放不下,放下方
  const aboveTop = input.selectionTop - input.toolbarHeight - TOOLBAR_GAP
  const belowTop = input.selectionBottom + TOOLBAR_GAP
  const desiredTop = aboveTop >= margin ? aboveTop : belowTop
  const maxTop = Math.max(margin, input.viewportHeight - input.toolbarHeight - margin)
  const top = Math.min(Math.max(desiredTop, margin), maxTop)

  return { left, top }
}
