import { View } from '@tarojs/components'
import { PropsWithChildren } from 'react'
import { buildResponsivePageClass, type ResponsivePageVariant } from './responsive-page-class'

interface ResponsivePageProps extends PropsWithChildren {
  className?: string
  padded?: boolean
  variant?: ResponsivePageVariant
}

export function ResponsivePage({
  children,
  className,
  padded = true,
  variant = 'default',
}: ResponsivePageProps) {
  return (
    <View className={buildResponsivePageClass(variant, className, padded)}>
      {children}
    </View>
  )
}
