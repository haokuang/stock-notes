import assert from 'node:assert/strict'
import test from 'node:test'

test('desktop H5 shell uses responsive web width instead of a fixed phone frame', () => {
  ;(globalThis as typeof globalThis & { TARO_ENV?: string }).TARO_ENV = 'h5'
  const { buildH5InjectedStyles } = require('./h5-styles') as typeof import('./h5-styles')
  const css = buildH5InjectedStyles()

  assert.match(css, /@media \(min-width: 769px\)/)
  assert.match(css, /\.taro-tabbar__container[\s\S]*width:\s*100% !important/)
  assert.match(css, /body\.no-tabbar #app[\s\S]*width:\s*100% !important/)
  assert.match(css, /max-width:\s*1180px !important/)
  assert.doesNotMatch(css, /width:\s*375px !important/)
  assert.doesNotMatch(css, /max-width:\s*375px !important/)
})

test('desktop H5 shell keeps document scrolling instead of clipping the app frame', () => {
  ;(globalThis as typeof globalThis & { TARO_ENV?: string }).TARO_ENV = 'h5'
  const { buildH5InjectedStyles } = require('./h5-styles') as typeof import('./h5-styles')
  const css = buildH5InjectedStyles()

  assert.match(css, /\.taro-tabbar__panel[\s\S]*min-height:\s*100vh !important/)
  assert.match(css, /body\.no-tabbar #app \.taro_router[\s\S]*overflow:\s*visible !important/)
  assert.doesNotMatch(css, /height:\s*calc\(100vh - 40px\) !important/)
  assert.doesNotMatch(css, /border-radius:\s*20px !important/)
})
