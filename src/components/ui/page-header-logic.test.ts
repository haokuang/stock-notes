import assert from 'node:assert/strict'
import test from 'node:test'
import { computeHeaderMetrics } from './page-header-logic'

test('computeHeaderMetrics: non-WEAPP returns zeros (CSS safe-area handles it)', () => {
  const m = computeHeaderMetrics({ isWeapp: false })
  assert.equal(m.statusBarHeight, 0)
  assert.equal(m.capsuleRightGap, 0)
})

test('computeHeaderMetrics: WEAPP with full info returns expected values', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { right: 87 },
  })
  // statusBarHeight 直传
  assert.equal(m.statusBarHeight, 24)
  // capsuleRightGap = windowWidth - capsule.right
  // 即"胶囊右边到屏幕右边缘的距离",作为 paddingRight 让 rightSlot 容器整体让出该宽度,内部元素自然避开胶囊
  assert.equal(m.capsuleRightGap, 288)
})

test('computeHeaderMetrics: WEAPP without systemInfo falls back to statusBarHeight=20', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    capsule: { right: 87 },
  })
  // 缺 systemInfo 时 windowWidth 也是 undefined,无法算几何,capsule 也降级到固定 fallback
  assert.equal(m.statusBarHeight, 20)
  assert.equal(m.capsuleRightGap, 16)
})

test('computeHeaderMetrics: WEAPP without capsule falls back to capsuleRightGap=16', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
  })
  assert.equal(m.statusBarHeight, 24)
  assert.equal(m.capsuleRightGap, 16)
})

test('computeHeaderMetrics: statusBarHeight=0 treated as degraded scenario', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 0, windowWidth: 375 },
    capsule: { right: 87 },
  })
  assert.equal(m.statusBarHeight, 0)
  // 视为降级,capsuleRightGap 也归零,让 CSS safe-area 接管
  assert.equal(m.capsuleRightGap, 0)
})

test('computeHeaderMetrics: capsule.right > windowWidth returns 0 (anomaly)', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { right: 999 },
  })
  assert.equal(m.capsuleRightGap, 0)
})

test('computeHeaderMetrics: same input produces same output (idempotent)', () => {
  const input = {
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { right: 87 },
  }
  const a = computeHeaderMetrics(input)
  const b = computeHeaderMetrics(input)
  assert.deepEqual(a, b)
})
