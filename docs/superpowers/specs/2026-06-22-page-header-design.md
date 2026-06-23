# 自定义 PageHeader 公共组件设计

- 日期：2026-06-22
- 状态：已审批，待 writing-plans
- 作者：ZCode（brainstorming 输出）

## 背景

项目内 6 个页面（`note-edit` / `note-detail` / `ai-report` / `heatmap-detail` / `image-ai` / `stock`）都使用了 `navigationStyle: 'custom'`，并在每个页面顶部手撸了一份几乎相同的自定义 header：

```tsx
<View className="flex items-center justify-between px-4 pb-2 bg-background sticky top-0 z-40"
      style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
  {/* 左返回 / 中标题 / 右操作 */}
</View>
```

该模板只预留了状态栏高度（`0.75rem = 12px`），没有读取 `Taro.getMenuButtonBoundingClientRect()`，导致：

1. 状态栏高分辨率机型（iOS 刘海 / 安卓挖孔）下，标题文字与状态栏图标重叠
2. 右侧"保存"等操作按钮可能被微信胶囊菜单遮挡
3. 6 处复制粘贴，修改需要改 6 个文件
4. 当前页面（如 note-edit 587 行）已经难以维护

## 目标

抽出 `PageHeader` 公共组件：

- 状态栏避让 ✅
- 微信胶囊避让 ✅（仅 WEAPP，其他平台回退到 CSS safe-area）
- 一次实现，6 处复用
- 单测覆盖边界 case
- 全 Tailwind，零 `.css` 文件

## 非目标

- 不拆 `note-edit` 587 行大文件（避免 scope 扩散）
- 不修改非 custom 风格页面
- 不引入新依赖
- 不改业务逻辑（onBack / onSave 等回调不变）

## 架构

```
src/components/ui/page-header/
├── index.tsx                 // 组件入口（含 useEffect 拉取平台数据）
├── page-header-logic.ts      // 纯函数：metrics 计算（可单测）
├── page-header-logic.test.ts // 7 个单测
```

无 `.css` 文件。

## 公开 API

```ts
interface PageHeaderProps {
  /** 标题，string 时默认渲染 <Text>，其它类型直接渲染 */
  title?: React.ReactNode
  /** 不传则不渲染返回按钮 */
  onBack?: () => void
  /** 自定义返回图标，默认 <ArrowLeft size={20} color="#161826" /> */
  backIcon?: React.ReactNode
  /** 右侧操作区（如保存按钮） */
  rightSlot?: React.ReactNode
  /** 覆盖左侧（返回按钮 + 标题左侧的预留区） */
  leftSlot?: React.ReactNode
  /** 默认 'bg-background'，可改为 'bg-transparent' 等 */
  background?: string
  /** 默认 true；false 时不 sticky */
  sticky?: boolean
  /** 透传给根 View */
  className?: string
  /** 透传给根 View */
  style?: React.CSSProperties
}
```

## 内部计算（page-header-logic.ts）

```ts
export interface CapsuleRect {
  top: number
  height: number
  right: number
  width: number
}

export interface HeaderMetrics {
  /** 状态栏像素高度，0 表示由 CSS safe-area 接管 */
  statusBarHeight: number
  /** 右侧需要让出的像素（避开微信胶囊 + safe-area） */
  capsuleRightGap: number
  /** 整个 header 高度（含 paddingTop），供下游定位使用 */
  totalHeight: number
}

export function computeHeaderMetrics(input: {
  isWeapp: boolean
  systemInfo?: { statusBarHeight: number; windowWidth: number }
  capsule?: Partial<CapsuleRect>
}): HeaderMetrics
```

### 默认值与边界 case

| 输入 | statusBarHeight | capsuleRightGap |
| --- | --- | --- |
| 非 WEAPP | 0 | 0 |
| WEAPP + 完整信息 | 取 systemInfo.statusBarHeight | `windowWidth - capsule.right + capsule.width` |
| WEAPP + systemInfo 缺失 | fallback `20` | 同上 |
| WEAPP + capsule 缺失 | systemInfo.statusBarHeight | fallback `16` |
| WEAPP + capsule.right > windowWidth | systemInfo.statusBarHeight | `0`（异常输入不崩） |
| WEAPP + statusBarHeight = 0 | 0（视为降级） | 0 |

幂等：相同输入产生相同输出，便于单测。

## 渲染结构

```tsx
<View
  className={cn(
    'flex items-center justify-between px-4',
    background ?? 'bg-background',
    sticky && 'sticky top-0 z-40',
    className,
  )}
  style={{
    paddingTop: `calc(${metrics.statusBarHeight}px + env(safe-area-inset-top))`,
    paddingRight: `calc(${metrics.capsuleRightGap}px + env(safe-area-inset-right))`,
    paddingBottom: 8, // pb-2
    ...style,
  }}
>
  <View className="flex items-center gap-2 min-w-[80px]">
    {leftSlot ?? (onBack ? <BackButton ... /> : null)}
  </View>
  <View className="flex-1 flex items-center justify-center">
    {typeof title === 'string'
      ? <Text className="block text-base font-semibold text-on-surface">{title}</Text>
      : title}
  </View>
  <View className="flex items-center justify-end gap-2 min-w-[80px]">
    {rightSlot}
  </View>
</View>
```

`min-w-[80px]` 让左右两侧有最小占位，避免标题在某些机型下贴边。

## 平台分支

```ts
const isWeapp = Taro.getEnv() === Taro.ENV_TYPE.WEAPP
const [metrics, setMetrics] = useState<HeaderMetrics>(
  computeHeaderMetrics({ isWeapp: false }), // SSR 安全：服务端也安全
)

useEffect(() => {
  if (!isWeapp) return
  try {
    const sys = Taro.getSystemInfoSync()
    const capsule = Taro.getMenuButtonBoundingClientRect()
    setMetrics(computeHeaderMetrics({ isWeapp: true, systemInfo: sys, capsule }))
  } catch {
    setMetrics(computeHeaderMetrics({ isWeapp: true })) // 降级默认
  }
}, [isWeapp])
```

`Taro.getEnv()` 在模块加载时就执行（非 useState/useEffect），符合 AGENTS.md "平台检测直接判断" 的要求。

## 接入清单

| 文件 | 当前 | 接入后 |
| --- | --- | --- |
| `src/pages/note-edit/index.tsx:293-313` | 21 行 View + style | `<PageHeader title=... onBack=... rightSlot={...} />` |
| `src/pages/note-detail/index.tsx:328-...` | 同模板 | 同上 |
| `src/pages/ai-report/index.tsx:113-...` | 同模板 | 同上 |
| `src/pages/heatmap-detail/index.tsx:55-...` | 同模板 | 同上 |
| `src/pages/image-ai/index.tsx:100-...` | 同模板 | 同上 |
| `src/pages/stock/index.tsx:265-...` | 同模板 | 同上 |

接入示例（note-edit）：

```tsx
// 旧 21 行
// 新
<PageHeader
  title={noteId
    ? type === 'doc' ? '编辑文档' : '编辑笔记'
    : type === 'doc' ? '上传文档' : '记录笔记'}
  onBack={() => Taro.navigateBack()}
  rightSlot={
    <Button size="sm" className="rounded-full"
            disabled={loading || saving || Boolean(loadError)}
            onClick={onSave}>
      <Text className="block text-xs font-semibold text-white">
        {saving ? '保存中' : '保存'}
      </Text>
    </Button>
  }
/>
```

各页面 title 文本保持不变（业务不重构），仅替换容器。

## 测试

### 单测（page-header-logic.test.ts）

7 个 case，覆盖纯函数 `computeHeaderMetrics`：

1. ✅ 非 WEAPP → 三字段均为 0
2. ✅ WEAPP + 完整信息 → 正确数值
3. ✅ WEAPP + systemInfo 缺失 → statusBarHeight fallback 20
4. ✅ WEAPP + capsule 缺失 → capsuleRightGap fallback 16
5. ✅ WEAPP + statusBarHeight=0 → 视为降级场景，totalHeight 仅算 padding
6. ✅ WEAPP + capsule.right > windowWidth → capsuleRightGap = 0，不崩
7. ✅ 多次调用幂等（同样输入同样输出）

### 集成验证

1. `pnpm tsc` → 0 错误
2. `pnpm lint:build` → 0 错误
3. `pnpm exec tsx --test src/components/ui/page-header/page-header-logic.test.ts` → 7/7
4. `pnpm dev:web` → H5 端访问 `/pages/note-edit/index` 截图对比：
   - 状态栏图标与标题不重叠
   - 右侧保存按钮不被微信胶囊遮挡（仅在微信开发者工具 / 真机可见）
5. 微信开发者工具预览 6 个页面，确认顶部 UI 一致

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| `Taro.getSystemInfoSync` 在某些端不可用 | try/catch + fallback 默认值 |
| `getMenuButtonBoundingClientRect` 在 IDE 模拟器返回 0/异常 | 边界 case 5/6 已处理 |
| 标题变长时挤压返回按钮 | `min-w-[80px]` 兜底；标题过长建议保持单行省略号 |
| 既有页面背景色不一致 | 接受 `background` prop 让调用者覆盖 |

## 不在范围

- 不重构 `note-edit` 587 行大文件（独立任务）
- 不修改底部 TabBar
- 不引入 react-query / zustand 等新依赖
- 不改 backend 任何接口
