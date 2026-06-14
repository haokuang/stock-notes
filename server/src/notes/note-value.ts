export function normalizeOptionalPrice(
  value: number | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  return String(value)
}
