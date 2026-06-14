import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import { Network } from '@/network'

/**
 * 单只股票的实时价格刷新钩子
 * - sync() 调后端 POST /api/stocks/:id/refresh-price
 * - 后端 1 分钟内只允许 1 次;前端同时显示倒计时
 * - 倒计时基于 lastSyncAt + 60s 算出,客户端有 1 秒定时器
 * - 后端返回 429 时,直接用响应里的 cooldown_remaining_sec 覆盖本地倒计时
 */

export interface RefreshResponse {
  price: number
  change: number | null
  changePercent: number | null
  high: number | null
  low: number | null
  open: number | null
  volume: number | null
  price_time: string | null        // YYYY-MM-DD HH:mm
  price_time_label: string | null  // 短标签:今日 14:30 / 昨日收盘 / 06-13
  is_realtime: boolean
  source: 'tencent' | 'tushare' | 'cache'
  syncedAt: string
  cooldown_remaining_sec: number
}

const COOLDOWN_SEC = 60

export function useStockRefresh(stockId: string | null) {
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<RefreshResponse | null>(null)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 倒计时 ticker(每秒 -1)
  useEffect(() => {
    if (cooldownLeft <= 0) {
      if (tickerRef.current) {
        clearInterval(tickerRef.current)
        tickerRef.current = null
      }
      return
    }
    tickerRef.current = setInterval(() => {
      setCooldownLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [cooldownLeft > 0])  // eslint-disable-line react-hooks/exhaustive-deps

  // 进入页面时查询服务端状态
  useEffect(() => {
    if (!stockId) {
      setCooldownLeft(0)
      return
    }
    Network.request<{ data: { can_refresh: boolean; cooldown_remaining_sec: number } }>({
      url: `/api/stocks/${stockId}/refresh-status`,
    })
      .then((res) => {
        setCooldownLeft(res.data?.data?.cooldown_remaining_sec ?? 0)
      })
      .catch(() => {
        // 静默 — 401/404 不影响 UI
      })
  }, [stockId])

  const sync = useCallback(
    async (opts?: { silent?: boolean }): Promise<RefreshResponse | null> => {
      if (!stockId) return null
      if (refreshing) return null
      if (cooldownLeft > 0) {
        if (!opts?.silent) {
          Taro.showToast({ title: `请 ${cooldownLeft} 秒后再试`, icon: 'none' })
        }
        return null
      }
      setRefreshing(true)
      try {
        const res = await Network.request<{ data: RefreshResponse }>({
          url: `/api/stocks/${stockId}/refresh-price`,
          method: 'POST',
        })
        const data = res.data?.data
        if (data) {
          setLastRefresh(data)
          setCooldownLeft(COOLDOWN_SEC)
          if (!opts?.silent) {
            const sourceLabel =
              data.source === 'tencent' ? '腾讯' : data.source === 'tushare' ? 'Tushare' : '本地缓存'
            Taro.showToast({ title: `已刷新(${sourceLabel})`, icon: 'success' })
          }
        }
        return data ?? null
      } catch (e: any) {
        if (e?.statusCode === 429 || e?.data?.statusCode === 429) {
          // 服务端拒绝 — 用后端的倒计时
          const remain = e?.data?.data?.cooldown_remaining_sec ?? e?.data?.cooldown_remaining_sec ?? COOLDOWN_SEC
          setCooldownLeft(remain)
          if (!opts?.silent) {
            Taro.showToast({ title: `请 ${remain} 秒后再试`, icon: 'none' })
          }
        } else {
          const msg = e?.data?.message ?? e?.errMsg ?? '刷新失败'
          if (!opts?.silent) Taro.showToast({ title: msg, icon: 'none' })
        }
        return null
      } finally {
        setRefreshing(false)
      }
    },
    [stockId, refreshing, cooldownLeft],
  )

  return {
    sync,
    refreshing,
    cooldownLeft,  // 0 = 可立即刷新
    lastRefresh,
    /** 倒计时格式化 mm:ss */
    cooldownLabel: cooldownLeft > 0 ? `00:${cooldownLeft.toString().padStart(2, '0')}` : '',
  }
}
