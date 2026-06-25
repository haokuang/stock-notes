import * as React from 'react'
import { useState } from 'react'
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

// 直接判断，禁止 useState + useEffect 设置平台（AGENTS.md 跨端兼容规则）
const IS_WEAPP = Taro.getEnv() === Taro.ENV_TYPE.WEAPP

/**
 * 同步读取系统信息和胶囊按钮几何，首次渲染即拿到正确 metrics，避免首帧闪烁。
 * 这两个都是 Taro 同步 API，不需要等 useEffect。
 */
function getInitialMetrics(): HeaderMetrics {
  if (!IS_WEAPP) {
    return { statusBarHeight: 0, capsuleRightGap: 0 }
  }
  try {
    const sys = Taro.getSystemInfoSync() as { statusBarHeight?: number; windowWidth?: number }
    const capsule = Taro.getMenuButtonBoundingClientRect() as {
      right?: number
    }
    return computeHeaderMetrics({
      isWeapp: true,
      systemInfo: { statusBarHeight: sys.statusBarHeight, windowWidth: sys.windowWidth },
      capsule,
    })
  } catch (e) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[PageHeader] getMenuButtonBoundingClientRect failed, falling back to safe-area defaults', e)
    }
    return computeHeaderMetrics({ isWeapp: true })
  }
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
  // lazy init: 首次渲染就拿到正确几何，避免 useEffect 二次 setMetrics 造成的闪烁
  const [metrics] = useState<HeaderMetrics>(getInitialMetrics)

  const renderTitle = () => {
    if (typeof title === 'string') {
      return (
        <Text className="block text-base font-semibold text-on-surface max-w-full truncate">
          {title}
        </Text>
      )
    }
    return title
  }

  return (
    <View
      className={cn(
        'flex items-center justify-between px-4 pb-2',
        background,
        sticky && 'sticky top-0 z-40',
        className,
      )}
      style={{
        paddingTop: `calc(${metrics.statusBarHeight}px + env(safe-area-inset-top))`,
        paddingRight: `calc(${metrics.capsuleRightGap}px + env(safe-area-inset-right))`,
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
      <View className="flex-1 flex items-center justify-center overflow-hidden">
        {renderTitle()}
      </View>
      <View className="flex items-center justify-end gap-2 min-w-[80px]">
        {rightSlot}
      </View>
    </View>
  )
}
