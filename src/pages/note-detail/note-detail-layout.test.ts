import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('note detail header badges use readable text sizes', () => {
  const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
  const badgeSection = source.slice(
    source.indexOf('类型徽章 + 股票关联 + 标题'),
    source.indexOf('正文:H5'),
  )

  assert.match(badgeSection, /text-sm font-semibold/)
  assert.match(badgeSection, /text-xs text-on-surface-variant/)
  assert.doesNotMatch(badgeSection, /text-\[10px\]/)
  assert.doesNotMatch(badgeSection, /text-\[11px\]/)
})
