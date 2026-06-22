import { RichText, ScrollView, Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { BookOpenCheck, ExternalLink, RotateCcw, Send, Sparkles } from 'lucide-react-taro'
import { useEffect, useMemo, useState } from 'react'
import { getAgentApi } from '@/agent/agent-client'
import { errorPresentation, providerDescription, stageLabel } from '@/agent/agent-state'
import type { AgentMessage, AgentModelOption } from '@/agent/agent.types'
import { sessionStore } from '@/auth/session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useAgentConversation } from '@/hooks/use-agent-conversation'
import { Network } from '@/network'
import { getResearchAgentCopy, resolveSubjectType, type SubjectType } from '@/stocks/subject'

const makeRequestId = () => `agent-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
const modelKey = (option: AgentModelOption) => `${option.provider}:${option.model}`

/**
 * 单条消息体:user 走纯文本,assistant 走 strip-think + markdown
 * 富文本渲染走 Taro.RichText(nodes=HTML 字符串),H5 端会被翻译为 dangerouslySetInnerHTML
 */
function MessageBody({ message }: { message: AgentMessage }) {
  const isUser = message.role === 'user'
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (isUser) {
      setHtml(null) // user 走 fallback 的纯文本
      return
    }
    if (!message.content) {
      setHtml('')
      return
    }
    renderAssistantContent(message.content).then((rendered) => {
      if (!cancelled) setHtml(rendered)
    })
    return () => {
      cancelled = true
    }
  }, [message.content, message.id, isUser])

  if (isUser) {
    return (
      <Text className="block whitespace-pre-wrap text-sm leading-relaxed">{renderUserContent(message.content)}</Text>
    )
  }
  if (html === null) {
    return <Text className="block text-sm leading-relaxed opacity-60">…</Text>
  }
  if (!html) {
    return <Text className="block text-sm leading-relaxed opacity-60">（模型未返回内容）</Text>
  }
  // md-content className 复用笔记页 .md-content CSS 作用域
  // (h1/h2/p/blockquote/table/th/td/ul/ol 等都已配好样式)
  return <RichText nodes={html} className="md-content block text-sm text-on-surface leading-relaxed" />
}

/**
 * 剥离 deepseek-r1 / kimi 等推理模型的 <think>...</think> 块
 * 保留块外正文,块内多行 / 含换行 / 含 markdown 都安全处理
 */
const stripThinkTags = (raw: string): string => {
  if (!raw) return ''
  // 非贪婪,跨行匹配,支持大小写不敏感(部分模型输出 <Think>)
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

/** user 输入的 message 直接当纯文本(避免任何 HTML 注入) */
const renderUserContent = (raw: string): string => raw

/** assistant 消息:strip think → 服务端 marked+DOMPurify 渲染 */
const renderAssistantContent = async (raw: string): Promise<string> => {
  const cleaned = stripThinkTags(raw)
  if (!cleaned) return ''
  try {
    const res = await Network.request({
      url: '/api/notes/render-md',
      method: 'POST',
      data: { md: cleaned },
    })
    const body = (res.data ?? {}) as { html?: string }
    return body?.html ?? ''
  } catch (cause) {
    console.error('[agent-chat] render md failed', cause)
    return cleaned
  }
}

export default function AgentChatPage() {
  const [threadId, setThreadId] = useState<string | null>(null)
  const [stockName, setStockName] = useState('研究标的')
  const [subjectType, setSubjectType] = useState<SubjectType>('stock')
  const [models, setModels] = useState<AgentModelOption[]>([])
  const [selectedModelKey, setSelectedModelKey] = useState('')
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const userId = sessionStore.get()?.user?.id ?? null
  const { state } = useAgentConversation({ threadId, runId: activeRunId, userId })

  useLoad((options) => {
    const loadedStockName = options.stock_name ? decodeURIComponent(options.stock_name) : '研究标的'
    const loadedSubjectType = resolveSubjectType(options.subject_type, loadedStockName)
    setThreadId(options.thread_id || null)
    setStockName(loadedStockName)
    setSubjectType(loadedSubjectType)
    Taro.setNavigationBarTitle({ title: getResearchAgentCopy(loadedSubjectType).navigationTitle })
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
  const agentCopy = getResearchAgentCopy(subjectType)
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
                {agentCopy.emptyPrompt}
              </Text>
            </CardContent>
          </Card>
        ) : (
          <View className="space-y-3">
            {state.messages.filter((message) => message.role !== 'tool').map((message) => (
              <View key={message.id} className={message.role === 'user' ? 'ml-10' : 'mr-6'}>
                <Card className={message.role === 'user' ? 'bg-primary text-primary-foreground' : ''}>
                  <CardContent className="p-4">
                    <MessageBody message={message} />
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
