# PageHeader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a reusable `PageHeader` component that handles status bar + WeChat capsule avoidance, and migrate 6 custom-header pages to use it.

**Architecture:** Pure function `computeHeaderMetrics(input)` (testable, no Taro side effects) + thin React component that calls `Taro.getSystemInfoSync()` / `Taro.getMenuButtonBoundingClientRect()` in `useEffect` and feeds the result into `computeHeaderMetrics`. Slots + props API for callers.

**Tech Stack:** Taro 4.1 + React 18 + TypeScript + Tailwind CSS 4 + `cn()` from `@/lib/utils`. Test runner: `node:test` via `pnpm exec tsx --test`.

---

## File Structure

新增：
- `src/components/ui/page-header.tsx` — 组件入口（含 useEffect 拉取平台数据）
- `src/components/ui/page-header-logic.ts` — 纯函数：metrics 计算
- `src/components/ui/page-header-logic.test.ts` — 7 个单测

修改（替换 header）：
- `src/pages/note-edit/index.tsx` (lines 293-313)
- `src/pages/note-detail/index.tsx` (lines 328-345)
- `src/pages/ai-report/index.tsx` (lines 113-126)
- `src/pages/heatmap-detail/index.tsx` (lines 55-66)
- `src/pages/image-ai/index.tsx` (lines 100-110)
- `src/pages/stock/index.tsx` (lines 265-271)

---

## Task 1: 写 `computeHeaderMetrics` 单测并跑失败

**Files:**
- Create: `src/components/ui/page-header-logic.test.ts`

- [ ] **Step 1: 写失败的单测**

写 `src/components/ui/page-header-logic.test.ts`：

```ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { computeHeaderMetrics } from './page-header-logic'

test('computeHeaderMetrics: non-WEAPP returns zeros (CSS safe-area handles it)', () => {
  const m = computeHeaderMetrics({ isWeapp: false })
  assert.equal(m.statusBarHeight, 0)
  assert.equal(m.capsuleRightGap, 0)
  assert.equal(m.totalHeight, 0)
})

test('computeHeaderMetrics: WEAPP with full info returns expected values', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { top: 4, height: 32, right: 87, width: 87 },
  })
  // statusBarHeight 直传
  assert.equal(m.statusBarHeight, 24)
  // capsuleRightGap = windowWidth - capsule.right
  // 即"胶囊右边到屏幕右边缘的距离",作为 paddingRight 让 rightSlot 容器整体让出该宽度,内部元素自然避开胶囊
  assert.equal(m.capsuleRightGap, 288)
  // totalHeight = statusBarHeight + HEADER_PADDING_BOTTOM (8)
  assert.equal(m.totalHeight, 32)
})

test('computeHeaderMetrics: WEAPP without systemInfo falls back to statusBarHeight=20', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    capsule: { top: 4, height: 32, right: 87, width: 87 },
  })
  assert.equal(m.statusBarHeight, 20)
  assert.equal(m.capsuleRightGap, 288)
  assert.equal(m.totalHeight, 28)
})

test('computeHeaderMetrics: WEAPP without capsule falls back to capsuleRightGap=16', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
  })
  assert.equal(m.statusBarHeight, 24)
  assert.equal(m.capsuleRightGap, 16)
  assert.equal(m.totalHeight, 32)
})

test('computeHeaderMetrics: statusBarHeight=0 treated as degraded scenario', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 0, windowWidth: 375 },
    capsule: { top: 4, height: 32, right: 87, width: 87 },
  })
  assert.equal(m.statusBarHeight, 0)
  // 视为降级,capsuleRightGap 也归零,让 CSS safe-area 接管
  assert.equal(m.capsuleRightGap, 0)
})

test('computeHeaderMetrics: capsule.right > windowWidth returns 0 (anomaly)', () => {
  const m = computeHeaderMetrics({
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { top: 4, height: 32, right: 999, width: 87 },
  })
  assert.equal(m.capsuleRightGap, 0)
})

test('computeHeaderMetrics: same input produces same output (idempotent)', () => {
  const input = {
    isWeapp: true,
    systemInfo: { statusBarHeight: 24, windowWidth: 375 },
    capsule: { top: 4, height: 32, right: 87, width: 87 },
  }
  const a = computeHeaderMetrics(input)
  const b = computeHeaderMetrics(input)
  assert.deepEqual(a, b)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm exec tsx --test src/components/ui/page-header-logic.test.ts`
Expected: FAIL with "Cannot find module './page-header-logic'"

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/page-header-logic.test.ts
git commit -m "test: 增加 PageHeader metrics 计算纯函数单测 (RED)"
```

---

## Task 2: 实现 `computeHeaderMetrics` 并跑通单测

**Files:**
- Create: `src/components/ui/page-header-logic.ts`

- [ ] **Step 1: 实现纯函数**

写 `src/components/ui/page-header-logic.ts`：

```ts
export interface CapsuleRect {
  top: number
  height: number
  right: number
  width: number
}

export interface HeaderMetrics {
  /** 状态栏像素高度。0 表示由 CSS safe-area 接管 */
  statusBarHeight: number
  /** 右侧需要让出的像素（避开微信胶囊 + safe-area）。0 表示不需要避让 */
  capsuleRightGap: number
  /** 整个 header 高度（statusBar + 内容 + paddingBottom），下游定位用 */
  totalHeight: number
}

const FALLBACK_STATUS_BAR_HEIGHT = 20
const FALLBACK_CAPSULE_RIGHT_GAP = 16
const HEADER_PADDING_BOTTOM = 8

export function computeHeaderMetrics(input: {
  isWeapp: boolean
  systemInfo?: { statusBarHeight?: number; windowWidth?: number }
  capsule?: Partial<CapsuleRect>
}): HeaderMetrics {
  // 非 WEAPP：交给 CSS safe-area 处理
  if (!input.isWeapp) {
    return { statusBarHeight: 0, capsuleRightGap: 0, totalHeight: 0 }
  }

  const rawStatusBar = input.systemInfo?.statusBarHeight
  const windowWidth = input.systemInfo?.windowWidth

  // statusBarHeight=0 视为降级场景（IDE 模拟器、未知机型）
  if (rawStatusBar === 0) {
    return { statusBarHeight: 0, capsuleRightGap: 0, totalHeight: HEADER_PADDING_BOTTOM }
  }

  const statusBarHeight =
    typeof rawStatusBar === 'number' && rawStatusBar > 0
      ? rawStatusBar
      : FALLBACK_STATUS_BAR_HEIGHT

  // 没有胶囊信息：留默认值让右侧不挤压，但允许后续布局
  if (!input.capsule || typeof input.capsule.right !== 'number') {
    return {
      statusBarHeight,
      capsuleRightGap: FALLBACK_CAPSULE_RIGHT_GAP,
      totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
    }
  }

  // 异常输入：capsule.right 超过 windowWidth
  if (typeof windowWidth !== 'number' || input.capsule.right > windowWidth) {
    return {
      statusBarHeight,
      capsuleRightGap: 0,
      totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
    }
  }

  const capsuleRightGap = windowWidth - input.capsule.right
  return {
    statusBarHeight,
    capsuleRightGap,
    totalHeight: statusBarHeight + HEADER_PADDING_BOTTOM,
  }
}
```

- [ ] **Step 2: 跑测试确认通过**

Run: `pnpm exec tsx --test src/components/ui/page-header-logic.test.ts`
Expected: 7/7 PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/page-header-logic.ts
git commit -m "feat(ui): 实现 PageHeader metrics 计算纯函数"
```

---

## Task 3: 实现 `PageHeader` 组件

**Files:**
- Create: `src/components/ui/page-header.tsx`

- [ ] **Step 1: 写组件**

写 `src/components/ui/page-header.tsx`：

```tsx
import * as React from 'react'
import { useEffect, useState } from 'react'
import Taro from '@tarojs/taro'
import { View, Text } from '@tarojs/components'
import { ArrowLeft } from 'lucide-react-taro'
import { cn } from '@/lib/utils'
import {
  computeHeaderMetrics,
  type HeaderMetrics,
} from './page-header-logic'

export interface PageHeaderProps {
  /** 标题。string 时自动渲染 <Text>，其它类型直接渲染 */
  title?: React.ReactNode
  /** 不传则不渲染返回按钮 */
  onBack?: () => void
  /** 自定义返回图标 */
  backIcon?: React.ReactNode
  /** 右侧操作区（如保存按钮） */
  rightSlot?: React.ReactNode
  /** 覆盖左侧（返回按钮 + 标题左侧的预留区） */
  leftSlot?: React.ReactNode
  /** 默认 'bg-background'，可改为 'bg-transparent' 等 */
  background?: string
  /** 默认 true；false 时不 sticky */
  sticky?: boolean
  className?: string
  style?: React.CSSProperties
}

// 直接判断，禁止 useState + useEffect（AGENTS.md 跨端兼容规则）
const IS_WEAPP = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

const DEFAULT_METRICS: HeaderMetrics = {
  statusBarHeight: 0,
  capsuleRightGap: 0,
  totalHeight: 0,
}

export function PageHeader({
  title,
  onBack,
  backIcon,
  rightSlot,
  leftSlot,
  background = 'bg-background',
  sticky = true,
  className,
  style,
}: PageHeaderProps) {
  const [metrics, setMetrics] = useState<HeaderMetrics>(DEFAULT_METRICS)

  useEffect(() => {
    if (!IS_WEAPP) return
    try {
      const sys = Taro.getSystemInfoSync() as { statusBarHeight?: number; windowWidth?: number }
      const capsule = Taro.getMenuButtonBoundingClientRect() as {
        top?: number
        height?: number
        right?: number
        width?: number
      }
      setMetrics(
        computeHeaderMetrics({
          isWeapp: true,
          systemInfo: { statusBarHeight: sys.statusBarHeight, windowWidth: sys.windowWidth },
          capsule,
        }),
      )
    } catch {
      setMetrics(computeHeaderMetrics({ isWeapp: true }))
    }
  }, [])

  const renderTitle = () => {
    if (typeof title === 'string') {
      return (
        <Text className="block text-base font-semibold text-on-surface">
          {title}
        </Text>
      )
    }
    return title
  }

  return (
    <View
      className={cn(
        'flex items-center justify-between px-4',
        background,
        sticky && 'sticky top-0 z-40',
        className,
      )}
      style={{
        paddingTop: `calc(${metrics.statusBarHeight}px + env(safe-area-inset-top))`,
        paddingRight: `calc(${metrics.capsuleRightGap}px + env(safe-area-inset-right))`,
        paddingBottom: 8,
        ...style,
      }}
    >
      <View className="flex items-center gap-2 min-w-[80px]">
        {leftSlot ??
          (onBack ? (
            <View
              className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container"
              onClick={onBack}
            >
              {backIcon ?? <ArrowLeft size={20} color="#161826" />}
            </View>
          ) : null)}
      </View>
      <View className="flex-1 flex items-center justify-center">
        {renderTitle()}
      </View>
      <View className="flex items-center justify-end gap-2 min-w-[80px]">
        {rightSlot}
      </View>
    </View>
  )
}
```

- [ ] **Step 2: tsc 检查**

Run: `pnpm tsc`
Expected: 0 错误

- [ ] **Step 3: lint 检查**

Run: `pnpm lint:build`
Expected: 0 错误（只可能有 browserslist 提示，不算错误）

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/page-header.tsx
git commit -m "feat(ui): 新增 PageHeader 公共组件(状态栏/胶囊避让)"
```

---

## Task 4: 接入 `note-edit/index.tsx`

**Files:**
- Modify: `src/pages/note-edit/index.tsx`

- [ ] **Step 1: 加 import**

在文件顶部现有 imports 后面加入（保持排序一致）：

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header**

把 lines 293-313（21 行的 View + Header 块）替换为：

```tsx
      {/* Header */}
      <PageHeader
        title={
          noteId
            ? type === 'doc'
              ? '编辑文档'
              : '编辑笔记'
            : type === 'doc'
              ? '上传文档'
              : '记录笔记'
        }
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <Button
            size="sm"
            className="rounded-full"
            disabled={loading || saving || Boolean(loadError)}
            onClick={onSave}
          >
            <Text className="block text-xs font-semibold text-white">
              {saving ? '保存中' : '保存'}
            </Text>
          </Button>
        }
      />
```

- [ ] **Step 3: tsc 检查**

Run: `pnpm tsc`
Expected: 0 错误

- [ ] **Step 4: lint 检查**

Run: `pnpm lint:build`
Expected: 0 错误

- [ ] **Step 5: Commit**

```bash
git add src/pages/note-edit/index.tsx
git commit -m "refactor(note-edit): 接入 PageHeader 组件"
```

---

## Task 5: 接入 `note-detail/index.tsx`

**Files:**
- Modify: `src/pages/note-detail/index.tsx`

- [ ] **Step 1: 加 import**

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header（lines 328-345）**

```tsx
      {/* Header */}
      <PageHeader
        title={isDoc ? '文档详情' : '笔记详情'}
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <View className="flex items-center gap-1">
            <View
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container"
              onClick={onEdit}
            >
              <Pencil size={18} color="#5B5E72" />
            </View>
            <View
              className="w-9 h-9 flex items-center justify-center rounded-full active:bg-surface-container"
              onClick={onDelete}
            >
              <Trash2 size={18} color="#D11A4A" />
            </View>
          </View>
        }
      />
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc && pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/note-detail/index.tsx
git commit -m "refactor(note-detail): 接入 PageHeader 组件"
```

---

## Task 6: 接入 `ai-report/index.tsx`

**Files:**
- Modify: `src/pages/ai-report/index.tsx`

- [ ] **Step 1: 加 import**

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header（lines 113-126）**

```tsx
      <PageHeader
        title={brief ? '今日简评' : agentReport ? '研究报告' : 'AI 投研报告'}
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <View
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container"
            onClick={onShare}
          >
            <Share2 size={18} color="#5B5E72" />
          </View>
        }
      />
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc && pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/ai-report/index.tsx
git commit -m "refactor(ai-report): 接入 PageHeader 组件"
```

---

## Task 7: 接入 `heatmap-detail/index.tsx`

**Files:**
- Modify: `src/pages/heatmap-detail/index.tsx`

- [ ] **Step 1: 加 import**

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header（lines 55-66）**

```tsx
      <PageHeader title="记录热力图" onBack={() => Taro.navigateBack()} />
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc && pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/heatmap-detail/index.tsx
git commit -m "refactor(heatmap-detail): 接入 PageHeader 组件"
```

---

## Task 8: 接入 `image-ai/index.tsx`

**Files:**
- Modify: `src/pages/image-ai/index.tsx`

- [ ] **Step 1: 加 import**

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header（lines 100-110）**

```tsx
      <PageHeader title="AI 单图解读" onBack={() => Taro.navigateBack()} />
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc && pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/image-ai/index.tsx
git commit -m "refactor(image-ai): 接入 PageHeader 组件"
```

---

## Task 9: 接入 `stock/index.tsx`

**Files:**
- Modify: `src/pages/stock/index.tsx`

- [ ] **Step 1: 加 import**

```tsx
import { PageHeader } from '@/components/ui/page-header'
```

- [ ] **Step 2: 替换 header（lines 265-271）**

```tsx
      {/* 自定义 Header */}
      <PageHeader
        title={stock?.name ?? '加载中...'}
        onBack={() => Taro.navigateBack()}
        rightSlot={
          <View className="w-10 h-10 flex items-center justify-center rounded-full active:bg-surface-container">
            <EllipsisVertical size={20} color="#5B5E72" />
          </View>
        }
      />
```

- [ ] **Step 3: tsc + lint**

Run: `pnpm tsc && pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: Commit**

```bash
git add src/pages/stock/index.tsx
git commit -m "refactor(stock): 接入 PageHeader 组件"
```

---

## Task 10: 全量验证

**Files:**
- 不修改任何文件，只跑验证

- [ ] **Step 1: 跑 PageHeader 单测**

Run: `pnpm exec tsx --test src/components/ui/page-header-logic.test.ts`
Expected: 7/7 PASS

- [ ] **Step 2: 跑 tsc**

Run: `pnpm tsc`
Expected: 0 错误

- [ ] **Step 3: 跑 lint**

Run: `pnpm lint:build`
Expected: 0 错误

- [ ] **Step 4: 跑回归测试（确认不破坏既有功能）**

Run: `pnpm test:agent:all`
Expected: 通过

- [ ] **Step 5: 检查 git 状态干净**

Run: `git status --short`
Expected: 只显示未推送的 commits，无未提交文件

- [ ] **Step 6: 推送远端**

```bash
git push origin main
```

---

## Self-Review Notes

- ✅ Spec 覆盖：每个 spec 段落都有对应任务（PageHeader 组件 → Task 3、metrics 计算 → Task 2、6 处接入 → Tasks 4-9、测试 → Task 1/2、验证 → Task 10）
- ✅ Placeholder scan：无 TBD/TODO，所有代码块都是具体实现
- ✅ Type consistency：`HeaderMetrics`、`computeHeaderMetrics`、`PageHeaderProps` 在 Task 1/2 定义后，Task 3 全部复用，签名一致
- ✅ API 修正记录：Task 1 单测中明确推导了 `capsuleRightGap = windowWidth - capsule.right` 的语义（胶囊右边到屏幕右边缘的距离），Task 2 实现严格匹配
- ✅ totalHeight 算法：`statusBarHeight + HEADER_PADDING_BOTTOM(8)`，非 WEAPP 全 0，statusBarHeight=0 降级时只有 `HEADER_PADDING_BOTTOM(8)`。每个单测都断言了 totalHeight，避免下游使用时高度漂移
- ✅ 不在范围：login 页面（用户明确排除）、note-edit 587 行大文件拆分（spec 明确排除）
