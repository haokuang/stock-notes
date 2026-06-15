import assert from 'node:assert/strict'
import test from 'node:test'
import {
  rangesOverlap,
  resolveHighlightAnchor,
  type HighlightAnchor,
} from './highlight-anchor'

function makeAnchor(overrides: Partial<HighlightAnchor> = {}): HighlightAnchor {
  return {
    selectedText: 'hello world',
    prefixText: '',
    suffixText: '',
    startOffset: 0,
    endOffset: 11,
    sourceHash: 'hash',
    ...overrides,
  }
}

test('uses original offsets when hash and selected text still match', () => {
  const text = 'say hello world today'
  const anchor = makeAnchor({ startOffset: 4, endOffset: 15 })
  const resolved = resolveHighlightAnchor(text, anchor, 'hash')
  assert.deepEqual(resolved, { startOffset: 4, endOffset: 15 })
})

test('relocates a quote after text is inserted before it', () => {
  const text = 'say HELLO there. then say hello world today'
  const anchor = makeAnchor({
    selectedText: 'hello world',
    prefixText: 'say ',
    suffixText: ' today',
    startOffset: 26,
    endOffset: 37,
    sourceHash: 'old',
  })
  const resolved = resolveHighlightAnchor(text, anchor, 'new')
  assert.deepEqual(resolved, { startOffset: 26, endOffset: 37 })
})

test('uses prefix and suffix to choose one repeated quote', () => {
  const text = 'alpha hello world beta. gamma hello world delta.'
  const anchor = makeAnchor({
    selectedText: 'hello world',
    prefixText: 'alpha ',
    suffixText: ' beta',
    startOffset: 6,
    endOffset: 17,
    sourceHash: 'old',
  })
  const resolved = resolveHighlightAnchor(text, anchor, 'new')
  assert.deepEqual(resolved, { startOffset: 6, endOffset: 17 })
})

test('returns null when repeated quote candidates have equal context score', () => {
  const text = 'alpha hello world beta. gamma hello world delta.'
  const anchor = makeAnchor({
    selectedText: 'hello world',
    prefixText: '',
    suffixText: '',
    startOffset: 6,
    endOffset: 17,
    sourceHash: 'old',
  })
  const resolved = resolveHighlightAnchor(text, anchor, 'new')
  assert.equal(resolved, null)
})

test('returns null when selected text no longer exists', () => {
  const text = 'say there. nothing matches.'
  const anchor = makeAnchor({
    selectedText: 'hello world',
    startOffset: 4,
    endOffset: 15,
    sourceHash: 'old',
  })
  assert.equal(resolveHighlightAnchor(text, anchor, 'new'), null)
})

test('treats touching ranges as non-overlapping', () => {
  assert.equal(
    rangesOverlap({ startOffset: 0, endOffset: 5 }, { startOffset: 5, endOffset: 10 }),
    false,
  )
})

test('treats intersecting ranges as overlapping', () => {
  assert.equal(
    rangesOverlap({ startOffset: 0, endOffset: 5 }, { startOffset: 3, endOffset: 10 }),
    true,
  )
})

test('returns null when original offset substring does not match selected text', () => {
  const text = 'totally different content here'
  const anchor = makeAnchor({
    selectedText: 'hello world',
    startOffset: 0,
    endOffset: 11,
    sourceHash: 'hash',
  })
  assert.equal(resolveHighlightAnchor(text, anchor, 'hash'), null)
})

test('respects the 32-character context window when scoring', () => {
  const before = 'x'.repeat(40)
  const after = 'y'.repeat(40)
  const text = `${before}TARGET${after}`
  const anchor = makeAnchor({
    selectedText: 'TARGET',
    prefixText: 'x'.repeat(32),
    suffixText: 'y'.repeat(32),
    startOffset: 40,
    endOffset: 46,
    sourceHash: 'old',
  })
  const resolved = resolveHighlightAnchor(text, anchor, 'new')
  assert.deepEqual(resolved, { startOffset: 40, endOffset: 46 })
})
