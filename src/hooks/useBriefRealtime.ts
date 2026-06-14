import { useEffect } from 'react'
import Taro from '@tarojs/taro'
import { getSupabase } from '../lib/supabase'
import { ensureNotificationPermission, notify } from '../lib/notification'

/**
 * 订阅 stock_briefs 实时推送
 * - INSERT / UPDATE 都会触发 onBrief
 * - 自动在卸载时退订,防止泄漏
 * - 红色 brief(stop_loss_triggered=true 或 signal='red') 弹浏览器原生通知(若已授权)
 */
export interface BriefEvent {
  id: string
  stock_id: string
  trade_date: string
  signal: 'green' | 'yellow' | 'red'
  action: 'hold' | 'review' | 'sell'
  technical_analysis: string
  logic_judgment: string
  sell_reasons: string[]
  evidence_note_ids: string[]
  stop_loss_triggered: boolean | string
  price_at_brief: string | null
  created_at: string
  updated_at: string
}

export function isRedBrief(b: { signal: string; stop_loss_triggered?: boolean | string }): boolean {
  if (b.signal === 'red') return true
  if (b.stop_loss_triggered === true || b.stop_loss_triggered === 't') return true
  return false
}

interface UseBriefRealtimeOpts {
  /** null 表示不订阅(等参数就位) */
  stockId: string | null
  /** 简评列表发生变化的回调(用于合并去重) */
  onBrief: (b: BriefEvent) => void
  /** 进入页面时是否拉一次通知权限(默认 true,只拉一次) */
  requestNotificationPermission?: boolean
}

export function useBriefRealtime({ stockId, onBrief, requestNotificationPermission = true }: UseBriefRealtimeOpts) {
  useEffect(() => {
    if (!stockId) return

    // 一次性请求通知权限(不阻塞主流程)
    if (requestNotificationPermission) {
      ensureNotificationPermission().catch(() => {})
    }

    const supabase = getSupabase()
    const channel = supabase
      .channel(`briefs:${stockId}`)
      .on(
        // @ts-ignore - postgres_changes 类型在 supabase-js 中有但用 .on() 调用时类型推断不完整
        'postgres_changes',
        {
          event: '*',  // INSERT + UPDATE
          schema: 'public',
          table: 'stock_briefs',
          filter: `stock_id=eq.${stockId}`,
        },
        (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: BriefEvent; old: BriefEvent | null }) => {
          if (payload.eventType === 'DELETE') return
          const brief = payload.new as BriefEvent
          if (!brief?.id) return

          // 1) 回调 — 由调用方合并到 React state
          onBrief(brief)

          // 2) 红色 brief 弹系统通知
          if (isRedBrief(brief)) {
            const reason = brief.sell_reasons?.[0] || brief.logic_judgment?.slice(0, 60) || '触及预设触发条件'
            notify({
              title: '⚠️ 持仓触发卖出信号',
              body: `${brief.trade_date} · ${reason}`,
              tag: `brief-red-${brief.stock_id}`,
              url: `/pages/stock/index?stock_id=${brief.stock_id}`,
            })
            // 3) 顺带 in-app toast
            Taro.showToast({ title: '收到新卖出信号', icon: 'none' })
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [stockId])
}
