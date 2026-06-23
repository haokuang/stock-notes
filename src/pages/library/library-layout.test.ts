import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

test('library notes stay as a single-column list on all widths', () => {
  const source = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')
  const listSection = source.slice(source.indexOf('列表'), source.indexOf('FAB'))

  assert.match(listSection, /className="px-4 space-y-3"/)
  assert.doesNotMatch(listSection, /md:grid-cols-2/)
})
