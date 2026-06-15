import { View, Text } from '@tarojs/components'
import { Copy, Highlighter, Trash2 } from 'lucide-react-taro'

export interface NoteSelectionToolbarProps {
  mode: 'selection' | 'highlight'
  left: number
  top: number
  busy?: boolean
  onHighlight?: () => void
  onCopy: () => void
  onRemove?: () => void
}

/**
 * 笔记选区浮动工具条 — H5 端
 * 模式 selection: 显示"高亮 / 复制"
 * 模式 highlight: 显示"取消高亮 / 复制"
 *
 * 使用项目 UI Button 组件以保持风格统一;外层定位容器走 inline style 兼容 Taro 运行时。
 */
export function NoteSelectionToolbar(props: NoteSelectionToolbarProps) {
  const { mode, left, top, busy, onHighlight, onCopy, onRemove } = props
  if (left < 0 || top < 0) return null
  return (
    <View
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'row',
        gap: '4px',
        backgroundColor: '#161826',
        borderRadius: '12px',
        padding: '6px',
        boxShadow: '0 8px 24px rgba(15, 18, 36, 0.30)',
        alignItems: 'center',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {mode === 'selection' ? (
        <ToolbarAction
          icon={<Highlighter size={14} color="#F6D365" />}
          label={busy ? '保存中…' : '高亮'}
          disabled={busy}
          onClick={onHighlight}
        />
      ) : (
        <ToolbarAction
          icon={<Trash2 size={14} color="#D11A4A" />}
          label={busy ? '删除中…' : '取消高亮'}
          disabled={busy}
          onClick={onRemove}
        />
      )}
      <ToolbarAction
        icon={<Copy size={14} color="#FFFFFF" />}
        label="复制"
        onClick={onCopy}
      />
      {/* 向下小三角 */}
      <View
        style={{
          position: 'absolute',
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid #161826',
        }}
      />
    </View>
  )
}

interface ToolbarActionProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  disabled?: boolean
}

function ToolbarAction({ icon, label, onClick, disabled }: ToolbarActionProps) {
  return (
    <View
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 10px',
        borderRadius: '8px',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    >
      {icon}
      <Text className="block text-xs font-semibold text-white">{label}</Text>
    </View>
  )
}
