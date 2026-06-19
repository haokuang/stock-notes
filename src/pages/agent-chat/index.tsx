import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { BookOpenCheck, ExternalLink, RotateCcw, Send, Sparkles } from 'lucide-react-taro'
import { useMemo, useState } from 'react'
import { getAgentApi } from '@/agent/agent-client'
import { errorPresentation, providerDescription, stageLabel } from '@/agent/agent-state'
import type { AgentModelOption } from '@/agent/agent.types'
import { sessionStore } from '@/auth/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAgentConversation } from '@/hooks/use-agent-conversation'

const makeRequestId = () => `agent-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const modelKey = (option: AgentModelOption) => `${option.provider}:${option.model}`

export default function AgentChatPage() {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [stockName, setStockName] = useState('研究标的')
  const [models, setModels] = useState<AgentModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const userId = sessionStore.get()?.user?.id ?? null
  const { state } = useAgentConversation({ threadId, runId: activeRunId, userId })

  useLoad((options) => {
    setThreadId(options.thread_id || null)
    setStockName(options.stock_name ? decodeURIComponent(options.stock_name) : '研究标的')
    getAgentApi().listModels()
      .then((items) => {
        setModels(items)
        const firstAvailable = items.find((item) => item.available)
        setSelectedModelKey(firstAvailable ? modelKey(firstAvailable) : '')
      })
      .catch((cause) => {
        console.error('[agent-chat] models failed', cause)
        Taro.showToast({ title: '模型列表加载失败', icon: 'none' })
      })
  })

  const selectedModel = useMemo(
    () => models.find((item) => modelKey(item) === selectedModelKey) ?? null,
    [models, selectedModelKey],
  )
  const runBusy = state.run?.status === 'queued' || state.run?.status === 'running'

  const submit = async () => {
    const message = content.trim()
    if (!threadId || !selectedModel || !message || sending || runBusy) return
    setSending(true)
    try {
      const result = await getAgentApi().submitMessage(threadId, {
        content: message,
        provider: selectedModel.provider,
        model: selectedModel.model,
        clientRequestId: makeRequestId(),
      })
      setActiveRunId(result.run.id)
      setContent('')
    } catch (cause) {
      console.error('[agent-chat] submit failed', cause)
      Taro.showToast({ title: cause instanceof Error ? cause.message : '发送失败', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  const retry = async () => {
    if (!state.run || sending) return
    setSending(true)
    try {
      const result = await getAgentApi().retryRun(state.run.id, {
        clientRequestId: makeRequestId(),
        provider: selectedModel?.provider,
        model: selectedModel?.model,
      })
      setActiveRunId(result.run.id)
    } catch (cause) {
      Taro.showToast({ title: cause instanceof Error ? cause.message : '重试失败', icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  const saveReport = async () => {
    if (!state.run || saving) return
    setSaving(true)
    try {
      const report = await getAgentApi().saveReport(state.run.id)
      await Taro.navigateTo({ url: `/pages/ai-report/index?report_id=${encodeURIComponent(report.id)}` })
    } catch (cause) {
      Taro.showToast({ title: cause instanceof Error ? cause.message : '报告保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  const openCitation = (url: string) => {
    if (Taro.getEnv() === Taro.ENV_TYPE.WEB && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    Taro.setClipboardData({ data: url })
  }

  const failure = state.run?.status === 'failed' ? errorPresentation(state.run.errorCode) : null

  return (
    <View className="min-h-screen bg-[#EEF0F6] pb-44">
      <View className="sticky top-0 z-10 border-b border-white border-opacity-80 bg-[#EEF0F6] px-4 py-3">
        <View className="mb-2 flex items-center justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text className="block truncate text-lg font-semibold text-on-surface">{stockName}</Text>
            <Text className="block text-xs text-on-surface-variant">研究对话会自动保留，结论可沉淀为报告</Text>
          </View>
          {state.run ? <Badge variant="secondary">{stageLabel(state.run.stage)}</Badge> : null}
        </View>
        <Select value={selectedModelKey} onValueChange={setSelectedModelKey}>
          <SelectTrigger className="w-full bg-white" disabled={runBusy}>
            <SelectValue placeholder="选择研究模型" />
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => (
              <SelectItem key={modelKey(model)} value={modelKey(model)} disabled={!model.available}>
                <Text className="block">
                  {providerDescription(model.provider, model.label, model.model, model.credentialMode)}
                  {!model.available ? ` · ${model.unavailableReason ?? '暂不可用'}` : ''}
                </Text>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </View>

      <ScrollView scrollY className="px-4 py-4">
        {state.loading && state.messages.length === 0 ? (
          <View className="space-y-3">
            <Skeleton className="h-24 w-4/5 rounded-2xl" />
            <Skeleton className="ml-auto h-16 w-3/4 rounded-2xl" />
          </View>
        ) : state.messages.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center">
              <Sparkles className="mx-auto mb-3" size={28} color="#6D4DFF" />
              <Text className="block text-base font-semibold text-on-surface">从一个具体问题开始</Text>
              <Text className="mt-2 block text-sm leading-relaxed text-on-surface-variant">
                例如：结合我的历史笔记，梳理这只股票未来两个季度的核心催化与风险。
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className="space-y-3">
            {state.messages.filter((message) => message.role !== 'tool').map((message) => (
              <View key={message.id} className={message.role === 'user' ? 'ml-10' : 'mr-6'}>
                <Card className={message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}>
                  <CardContent className="p-4">
                    <Text className="block whitespace-pre-wrap text-sm leading-relaxed">{message.content}</Text>
                    {message.citations.length > 0 ? (
                      <View className="mt-4 space-y-2 border-t border-border pt-3">
                        <Text className="block text-xs font-semibold">参考来源</Text>
                        {message.citations.map((citation) => (
                          <Button key={citation.id} variant="ghost" className="h-auto w-full justify-between px-0 py-2" onClick={() => openCitation(citation.url)}>
                            <Text className="mr-2 block flex-1 truncate text-left text-xs">{citation.title || citation.source}</Text>
                            <ExternalLink size={14} color="#6D4DFF" />
                          </Button>
                        ))}
                      </View>
                    ) : null}
                  </CardContent>
                </Card>
              </View>
            ))}
          </View>
        )}

        {runBusy ? (
          <View className="mt-3 flex items-center gap-2 px-2">
            <Sparkles size={16} color="#6D4DFF" />
            <Text className="block text-sm text-on-surface-variant">{stageLabel(state.run?.stage)}…</Text>
          </View>
        ) : null}
        {failure ? (
          <Card className="mt-3 border-destructive">
            <CardContent className="p-4">
              <Text className="block text-sm text-destructive">{failure.label}</Text>
              {failure.retryable ? (
                <Button className="mt-3" variant="outline" size="sm" onClick={retry} disabled={sending}>
                  <RotateCcw size={16} color="#6D4DFF" />
                  <Text>重新生成</Text>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {state.run?.status === 'completed' ? (
          <Button className="mt-4 w-full" variant="secondary" onClick={saveReport} disabled={saving}>
            <BookOpenCheck size={17} color="#ffffff" />
            <Text>{saving ? '保存中…' : '保存为研究报告'}</Text>
          </Button>
        ) : null}
      </ScrollView>

      <View
        className="border-t border-border bg-white px-4 py-3"
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}
      >
        <Textarea
          value={content}
          onInput={(event) => setContent(event.detail.value)}
          maxlength={2000}
          autoHeight
          disabled={runBusy || sending}
          placeholder={runBusy ? '本轮研究完成后可继续追问' : '输入你的研究问题…'}
        />
        <View className="flex items-center justify-between gap-3">
          <Text className="block text-xs text-on-surface-variant">{content.length}/2000</Text>
          <Button size="sm" onClick={submit} disabled={!content.trim() || !selectedModel || runBusy || sending}>
            <Send size={16} color="#ffffff" />
            <Text>{sending ? '发送中' : '发送'}</Text>
          </Button>
        </View>
      </View>
    </View>
  )
}
