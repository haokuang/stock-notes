import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RESPONSIVE_PAGE_CLASS,
  RESPONSIVE_READING_PAGE_CLASS,
  buildResponsivePageClass,
} from './responsive-page-class'

test('default responsive page class centers desktop content with generous width', () => {
  assert.equal(
    buildResponsivePageClass(),
    RESPONSIVE_PAGE_CLASS,
  )
  assert.match(RESPONSIVE_PAGE_CLASS, /mx-auto/)
  assert.match(RESPONSIVE_PAGE_CLASS, /max-w-6xl/)
  assert.match(RESPONSIVE_PAGE_CLASS, /lg:px-8/)
})

test('reading responsive page class narrows long text content', () => {
  assert.equal(
    buildResponsivePageClass('reading'),
    RESPONSIVE_READING_PAGE_CLASS,
  )
  assert.match(RESPONSIVE_READING_PAGE_CLASS, /max-w-4xl/)
})

test('unpadded responsive page class keeps existing mobile page gutters intact', () => {
  assert.equal(
    buildResponsivePageClass('default', undefined, false),
    'mx-auto w-full max-w-6xl',
  )
})
