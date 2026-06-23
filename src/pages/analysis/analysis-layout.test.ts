import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const readAnalysisSource = () => readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

test('analysis stock selector stays as a single-column list on all widths', () => {
  const source = readAnalysisSource()
  const stockSelectorSection = source.slice(
    source.indexOf('选择研究标的'),
    source.indexOf('单图解读'),
  )

  assert.match(stockSelectorSection, /className="space-y-3"/)
  assert.doesNotMatch(stockSelectorSection, /md:grid-cols-2/)
})

test('analysis hero statistic pills use readable text on white pills', () => {
  const source = readAnalysisSource()
  const heroStatsSection = source.slice(
    source.indexOf('看多 {bullCount}'),
    source.indexOf('选择研究标的'),
  )

  assert.match(heroStatsSection, /text-primary/)
  assert.doesNotMatch(heroStatsSection, /text-white">看多/)
  assert.doesNotMatch(heroStatsSection, /text-white">看空/)
  assert.doesNotMatch(heroStatsSection, /text-white">中性/)
})
