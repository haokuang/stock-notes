import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('home recent notes stay as a single-column list on all widths', () => {
  const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
  const recentNotesSection = source.slice(source.indexOf('最近观点'))

  assert.match(recentNotesSection, /className="space-y-3"/)
  assert.doesNotMatch(recentNotesSection, /md:grid-cols-2/)
})
