/**
 * 笔记 Markdown 统一渲染 + 高亮 HTML 注入
 * 文档见 docs/superpowers/specs/2026-06-15-note-markdown-highlight-design.md
 *
 * - renderNoteMarkdown: marked → DOMPurify → 纯文本 → sha256
 * - injectHighlights: 把 text 偏移 → 文本节点偏移,按 offset desc 顺序拆节点并 wrap span
 *   span 用内联 style,确保 WeChat RichText 不依赖外部 CSS 也能上色
 */

import { createHash } from 'node:crypto'
import { marked } from 'marked'
import DOMPurify from 'isomorphic-dompurify'
import { HTMLElement, Node, TextNode, parse } from 'node-html-parser'
import { rangesOverlap } from './highlight-anchor'

export interface RenderHighlight {
  id: string
  selectedText: string
  startOffset: number
  endOffset: number
}

export interface RenderedNoteContent {
  html: string
  text: string
  hash: string
}

const HIGHLIGHT_STYLE =
  'background-color:#F6D365;border-radius:2px;padding:0 1px;'

export function renderNoteMarkdown(markdown: string): RenderedNoteContent {
  const source = markdown ?? ''
  let rawHtml: string
  try {
    rawHtml = marked.parse(source, { async: false }) as string
  } catch {
    const escaped = escapeHtml(source)
    return { html: `<p>${escaped}</p>`, text: source, hash: sha256(source) }
  }
  const safeHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
  })
  const root = parse(safeHtml)
  const text = root.text
  return { html: safeHtml, text, hash: sha256(text) }
}

export function injectHighlights(
  html: string,
  highlights: RenderHighlight[],
): string {
  // 1. 基础校验
  for (const h of highlights) {
    if (h.endOffset <= h.startOffset) {
      throw new Error(`Invalid range for highlight ${h.id}`)
    }
  }
  for (let i = 0; i < highlights.length; i++) {
    for (let j = i + 1; j < highlights.length; j++) {
      if (rangesOverlap(highlights[i], highlights[j])) {
        throw new Error(`Overlapping highlight ranges: ${highlights[i].id} vs ${highlights[j].id}`)
      }
    }
  }
  if (highlights.length === 0) return html

  // 2. 按 startOffset 倒序处理
  const ordered = [...highlights].sort((a, b) => b.startOffset - a.startOffset)
  const root = parse(html)

  for (const h of ordered) {
    applyHighlight(root, h)
  }

  return root.toString()
}

// ============ 内部 ============

function applyHighlight(root: HTMLElement, h: RenderHighlight): boolean {
  const textNodes = collectTextNodes(root)
  let cursor = 0
  const hits: { node: TextNode; startInNode: number; endInNode: number }[] = []

  for (const node of textNodes) {
    const len = node.text.length
    const nodeStart = cursor
    const nodeEnd = cursor + len
    cursor = nodeEnd

    if (nodeEnd <= h.startOffset) continue
    if (nodeStart >= h.endOffset) break

    const startInNode = Math.max(0, h.startOffset - nodeStart)
    const endInNode = Math.min(len, h.endOffset - nodeStart)
    if (endInNode > startInNode) {
      hits.push({ node, startInNode, endInNode })
    }
  }
  if (hits.length === 0) return false

  for (const { node, startInNode, endInNode } of hits) {
    const text = node.text
    const before = text.slice(0, startInNode)
    const middle = text.slice(startInNode, endInNode)
    const after = text.slice(endInNode)
    const parent = node.parentNode
    if (!parent) continue

    const span = new HTMLElement('span', {}, undefined, parent)
    span.setAttribute('data-highlight-id', escapeAttr(h.id))
    span.setAttribute('style', HIGHLIGHT_STYLE)
    span.textContent = middle

    // 用 TextNode 替换原 node 在 parent.childNodes 中的位置
    const siblings = (parent as any).childNodes as Node[]
    const idx = siblings.indexOf(node as any)
    if (idx < 0) continue

    const next: Node[] = []
    if (before) next.push(new TextNode(before, parent))
    next.push(span)
    if (after) next.push(new TextNode(after, parent))
    siblings.splice(idx, 1, ...next)
  }
  return true
}

function collectTextNodes(root: HTMLElement): TextNode[] {
  const out: TextNode[] = []
  const walk = (n: Node) => {
    if (n instanceof TextNode) {
      out.push(n)
      return
    }
    if (n instanceof HTMLElement) {
      for (const c of (n as any).childNodes as Node[]) walk(c)
    }
  }
  walk(root as any)
  return out
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
