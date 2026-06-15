/**
 * 笔记高亮锚点重定位
 * 文档见 docs/superpowers/specs/2026-06-15-note-markdown-highlight-design.md
 *
 * 解析策略:
 *  1. 若 source_hash 未变,且 start..end 处文本 === selected_text → 直接接受旧偏移。
 *  2. 否则扫描全部 selected_text 出现位置,逐个打分(前后 32 字符公共长度)。
 *  3. 排序: 分数 desc, 距旧位置 asc。
 *  4. 头部并列或无候选 → null(交由持久化层删除)。
 */

const CONTEXT_LIMIT = 32

export interface HighlightAnchor {
  selectedText: string
  prefixText: string
  suffixText: string
  startOffset: number
  endOffset: number
  sourceHash: string
}

export interface ResolvedAnchor {
  startOffset: number
  endOffset: number
}

export interface AnchorRange {
  startOffset: number
  endOffset: number
}

export function rangesOverlap(left: AnchorRange, right: AnchorRange): boolean {
  return left.startOffset < right.endOffset && right.startOffset < left.endOffset
}

export function resolveHighlightAnchor(
  text: string,
  anchor: HighlightAnchor,
  currentHash: string,
): ResolvedAnchor | null {
  const length = anchor.selectedText.length
  if (length === 0) return null
  if (anchor.endOffset - anchor.startOffset !== length) return null

  // 1) hash 一致 + 偏移处文本一致 → 直接接受
  if (
    anchor.sourceHash === currentHash &&
    text.slice(anchor.startOffset, anchor.endOffset) === anchor.selectedText
  ) {
    return { startOffset: anchor.startOffset, endOffset: anchor.endOffset }
  }

  // 2) 找所有 selected_text 出现位置
  const candidates: number[] = []
  let idx = text.indexOf(anchor.selectedText, 0)
  while (idx !== -1) {
    candidates.push(idx)
    idx = text.indexOf(anchor.selectedText, idx + 1)
  }
  if (candidates.length === 0) return null

  // 3) 打分 + 距离
  const oldCenter = (anchor.startOffset + anchor.endOffset) / 2
  const scored = candidates.map((start) => {
    const score = contextScore(
      text,
      start,
      anchor.selectedText,
      anchor.prefixText,
      anchor.suffixText,
    )
    const distance = Math.abs(start - anchor.startOffset)
    return { start, score, distance }
  })

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.distance - b.distance
  })

  // 4) 头部并列 → null;score=0(无上下文证据)也算歧义
  const best = scored[0]
  const second = scored[1]
  if (best.score === 0) return null
  if (
    second &&
    best.score === second.score &&
    best.distance === second.distance
  ) {
    return null
  }

  return { startOffset: best.start, endOffset: best.start + length }
}

function contextScore(
  text: string,
  startOffset: number,
  selectedText: string,
  prefixText: string,
  suffixText: string,
): number {
  const actualPrefix = text.slice(
    Math.max(0, startOffset - CONTEXT_LIMIT),
    startOffset,
  )
  const endOffset = startOffset + selectedText.length
  const actualSuffix = text.slice(endOffset, endOffset + CONTEXT_LIMIT)
  return commonSuffixLength(actualPrefix, prefixText)
    + commonPrefixLength(actualSuffix, suffixText)
}

function commonSuffixLength(actual: string, expected: string): number {
  const max = Math.min(actual.length, expected.length)
  let n = 0
  for (let i = 1; i <= max; i++) {
    if (actual[actual.length - i] === expected[expected.length - i]) n = i
    else break
  }
  return n
}

function commonPrefixLength(actual: string, expected: string): number {
  const max = Math.min(actual.length, expected.length)
  let n = 0
  for (let i = 0; i < max; i++) {
    if (actual[i] === expected[i]) n = i + 1
    else break
  }
  return n
}
