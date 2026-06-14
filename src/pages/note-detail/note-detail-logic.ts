export type NotePrice = string | number | null

export function hasNotePrice(value: NotePrice): boolean {
  return value !== null && value !== ''
}

export function formatNotePrice(value: NotePrice): string {
  if (!hasNotePrice(value)) return '—'

  const price = Number(value)
  return Number.isFinite(price) ? `¥${price.toFixed(2)}` : '—'
}
