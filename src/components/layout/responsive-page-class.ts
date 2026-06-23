export const RESPONSIVE_PAGE_CLASS = 'mx-auto w-full max-w-6xl px-4 md:px-6 lg:px-8'
export const RESPONSIVE_READING_PAGE_CLASS = 'mx-auto w-full max-w-4xl px-4 md:px-6 lg:px-8'
export const RESPONSIVE_PAGE_UNPADDED_CLASS = 'mx-auto w-full max-w-6xl'
export const RESPONSIVE_READING_PAGE_UNPADDED_CLASS = 'mx-auto w-full max-w-4xl'

export type ResponsivePageVariant = 'default' | 'reading'

const joinClassNames = (...classes: Array<string | undefined>) =>
  classes.filter(Boolean).join(' ')

export const buildResponsivePageClass = (
  variant: ResponsivePageVariant = 'default',
  className?: string,
  padded = true,
) =>
  joinClassNames(
    variant === 'reading'
      ? (padded ? RESPONSIVE_READING_PAGE_CLASS : RESPONSIVE_READING_PAGE_UNPADDED_CLASS)
      : (padded ? RESPONSIVE_PAGE_CLASS : RESPONSIVE_PAGE_UNPADDED_CLASS),
    className,
  )
