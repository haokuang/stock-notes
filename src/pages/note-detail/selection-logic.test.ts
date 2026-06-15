import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSelectionAnchor,
  clampToolbarPosition,
  overlapsAny,
  type TextRange,
} from './selection-logic'

test('builds selected text and 32-character context', () => {
  const text = 'The quick brown fox jumps over the lazy dog'
  const anchor = buildSelectionAnchor(text, 4, 9) // 'quick'
  assert.ok(anchor)
  assert.equal(anchor.selectedText, 'quick')
  assert.equal(anchor.startOffset, 4)
  assert.equal(anchor.endOffset, 9)
  assert.equal(anchor.prefixText, 'The ')
  assert.equal(anchor.suffixText, ' brown fox jumps over the lazy d')
  assert.equal(anchor.suffixText.length, 32)
})

test('builds shorter context near edges', () => {
  const text = 'hi there friend'
  const anchor = buildSelectionAnchor(text, 0, 2) // 'hi'
  assert.ok(anchor)
  assert.equal(anchor.selectedText, 'hi')
  assert.equal(anchor.prefixText, '')
  assert.equal(anchor.suffixText, ' there friend')
})

test('trims an all-whitespace selection to null', () => {
  const text = 'abc   def'
  assert.equal(buildSelectionAnchor(text, 3, 6), null)
})

test('preserves exact offsets for meaningful surrounding whitespace', () => {
  const text = 'a   b'
  const anchor = buildSelectionAnchor(text, 0, 1) // 'a'
  assert.ok(anchor)
  assert.equal(anchor.startOffset, 0)
  assert.equal(anchor.endOffset, 1)
})

test('rejects zero-length selection', () => {
  const text = 'hello world'
  assert.equal(buildSelectionAnchor(text, 5, 5), null)
})

test('rejects invalid offsets', () => {
  const text = 'hello'
  assert.equal(buildSelectionAnchor(text, -1, 3), null)
  assert.equal(buildSelectionAnchor(text, 0, 10), null)
  assert.equal(buildSelectionAnchor(text, 4, 2), null)
})

test('overlapsAny flags intersecting ranges but allows touching ranges', () => {
  const existing: TextRange[] = [
    { startOffset: 0, endOffset: 5 },
    { startOffset: 10, endOffset: 15 },
  ]
  assert.equal(overlapsAny({ startOffset: 3, endOffset: 7 }, existing), true)
  assert.equal(overlapsAny({ startOffset: 5, endOffset: 10 }, existing), false)
  assert.equal(overlapsAny({ startOffset: 7, endOffset: 9 }, existing), false)
})

test('centers toolbar above selection when there is space', () => {
  const result = clampToolbarPosition({
    selectionLeft: 100,
    selectionTop: 200,
    selectionBottom: 220,
    selectionWidth: 80, // range.getBoundingClientRect().width
    toolbarWidth: 80,
    toolbarHeight: 40,
    viewportWidth: 400,
    viewportHeight: 800,
  })
  // centerX = 100 + 80/2 = 140, desiredLeft = 140 - 40 = 100
  // 上方: 200 - 40 - 8 = 152
  assert.equal(result.left, 100)
  assert.equal(result.top, 152)
})

test('moves toolbar below selection when there is no top space', () => {
  const result = clampToolbarPosition({
    selectionLeft: 100,
    selectionTop: 5,
    selectionBottom: 25,
    toolbarWidth: 80,
    toolbarHeight: 40,
    viewportWidth: 400,
    viewportHeight: 800,
  })
  // toolbarHeight(40)+margin(8)=48 > selectionTop(5) → 落到底部: 25 + 8 = 33
  assert.equal(result.top, 33)
})

test('clamps toolbar inside viewport margins', () => {
  const result = clampToolbarPosition({
    selectionLeft: 10,
    selectionTop: 200,
    selectionBottom: 220,
    toolbarWidth: 80,
    toolbarHeight: 40,
    viewportWidth: 400,
    viewportHeight: 800,
    margin: 8,
  })
  assert.equal(result.left, 8) // 10 - (80-120/2=40) → -30, clamp 到 8
  assert.ok(result.left >= 8)
  assert.ok(result.left + 80 <= 400 - 8)
})
