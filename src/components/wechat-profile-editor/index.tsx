import { useState } from 'react'
import { View, Text, Image, Button as TaroButton, Input as TaroInput } from '@tarojs/components'
import { Network } from '@/network'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetFooter } from '@/components/ui/sheet'

interface WechatProfile {
  nickname: string | null
  avatar_url: string | null
}

interface WechatProfileEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  current: WechatProfile
  fallbackInitial: string
  onSaved: (profile: WechatProfile) => void
}

/**
 * 微信头像昵称填写能力(头像昵称完善)弹窗组件
 *
 * 使用微信原生 Button open-type="chooseAvatar" + Input type="nickname"
 * 这两个能力 @/components/ui 的 Button/Input 底层是 View 不支持,
 * 因此在此组件中使用 @tarojs/components 原生 Button/Input。
 */
export default function WechatProfileEditor({
  open,
  onOpenChange,
  current,
  fallbackInitial,
  onSaved,
}: WechatProfileEditorProps) {
  const [editNickname, setEditNickname] = useState(current.nickname ?? '')
  const [editAvatar, setEditAvatar] = useState(current.avatar_url ?? '')
  const [saving, setSaving] = useState(false)

  const avatarFallback = (editNickname || fallbackInitial || 'U').slice(0, 1).toUpperCase()

  // chooseAvatar 回调:拿到临时路径 → 上传 TOS → 拿到 URL
  const onChooseAvatar = async (e: any) => {
    const tempPath = e?.detail?.avatarUrl
    if (!tempPath) return
    const Taro = await import('@tarojs/taro')
    Taro.default.showLoading({ title: '上传中…' })
    try {
      const up = await Network.uploadFile({
        url: '/api/upload/image',
        filePath: tempPath,
        name: 'file',
        formData: {},
      })
      const json = JSON.parse(up.data)
      if (up.statusCode !== 200 || !json?.data?.url) {
        throw new Error(json?.message ?? '上传失败')
      }
      setEditAvatar(json.data.url)
    } catch (err) {
      console.error('[wechat-profile] avatar upload failed', err)
      Taro.default.showToast({ title: '头像上传失败', icon: 'none' })
    } finally {
      Taro.default.hideLoading()
    }
  }

  const saveProfile = async () => {
    setSaving(true)
    try {
      const res = await Network.request<{ data: WechatProfile }>({
        url: '/api/auth/wechat-profile',
        method: 'POST',
        data: { nickname: editNickname, avatar_url: editAvatar },
      })
      const profile = res.data?.data ?? { nickname: null, avatar_url: null }
      onSaved(profile)
      onOpenChange(false)
      const Taro = await import('@tarojs/taro')
      Taro.default.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      console.error('[wechat-profile] save failed', e)
      const Taro = await import('@tarojs/taro')
      Taro.default.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <Text className="block text-lg font-bold text-on-surface text-center">完善个人资料</Text>
          <Text className="block text-xs text-on-surface-variant text-center">设置你的头像和昵称</Text>
        </SheetHeader>

        <View className="mt-6 space-y-5">
          {/* 头像选择:微信原生 Button open-type="chooseAvatar" */}
          <View className="flex flex-col items-center gap-2">
            {editAvatar ? (
              <Image src={editAvatar} className="w-20 h-20 rounded-full" />
            ) : (
              <View className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6D4DFF 0%, #0F8C66 100%)' }}
              >
                <Text className="block text-2xl font-bold text-white">{avatarFallback}</Text>
              </View>
            )}
            <TaroButton
              openType="chooseAvatar"
              onChooseAvatar={onChooseAvatar}
              className="!bg-transparent !border-0 !p-0 !line-height-normal after:!border-0"
              style={{ background: 'transparent', border: 'none', padding: 0, lineHeight: 'normal' }}
            >
              <Text className="text-sm text-primary">点击更换头像</Text>
            </TaroButton>
          </View>

          {/* 昵称输入:微信原生 Input type="nickname" */}
          <View>
            <Text className="block text-xs font-medium text-on-surface-variant mb-2">昵称</Text>
            <View className="bg-gray-50 rounded-xl px-4 py-3">
              <TaroInput
                type="nickname"
                value={editNickname}
                onInput={(e: any) => setEditNickname(e.detail.value)}
                placeholder="点击填写昵称"
                maxlength={20}
                style={{ width: '100%', fontSize: '15px' }}
              />
            </View>
          </View>
        </View>

        <SheetFooter className="mt-6">
          <View className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              <Text className="block text-sm font-semibold">取消</Text>
            </Button>
            <Button
              className="flex-1 rounded-xl"
              onClick={saveProfile}
              disabled={saving}
            >
              <Text className="block text-sm font-semibold text-white">
                {saving ? '保存中…' : '保存'}
              </Text>
            </Button>
          </View>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
