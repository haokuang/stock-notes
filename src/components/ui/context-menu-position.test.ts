import assert from 'node:assert/strict'
import test from 'node:test'
import { computeContextMenuPosition } from './context-menu-position'

test('context menu opens below the press point by default', () => {
  const position = computeContextMenuPosition({
    anchor: { x: 120, y: 100 },
    content: { width: 160, height: 120 },
    viewport: { width: 390, height: 720 },
  })

  assert.equal(position.y, 112)
})

test('context menu stays inside the viewport when opening below would overflow', () => {
  const position = computeContextMenuPosition({
    anchor: { x: 360, y: 680 },
    content: { width: 160, height: 120 },
    viewport: { width: 390, height: 720 },
  })

  assert.deepEqual(position, { x: 222, y: 592 })
})
