const VIEWPORT_MARGIN = 8
const MENU_OPEN_OFFSET = 12

interface Point {
  x: number
  y: number
}

interface Size {
  width: number
  height: number
}

export function computeContextMenuPosition({
  anchor,
  content,
  viewport,
}: {
  anchor: Point
  content: Size
  viewport: Size
}): Point {
  const maxX = Math.max(VIEWPORT_MARGIN, viewport.width - content.width - VIEWPORT_MARGIN)
  const maxY = Math.max(VIEWPORT_MARGIN, viewport.height - content.height - VIEWPORT_MARGIN)

  return {
    x: Math.min(Math.max(anchor.x, VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(anchor.y + MENU_OPEN_OFFSET, VIEWPORT_MARGIN), maxY),
  }
}
