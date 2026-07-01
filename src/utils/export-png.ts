import { toPng } from 'html-to-image'

/**
 * 将 DOM 元素导出为 PNG
 */
export async function exportElementAsPng(
  element: HTMLElement,
  filename: string,
  options?: {
    backgroundColor?: string
    pixelRatio?: number
    width?: number
    height?: number
  }
) {
  const dataUrl = await toPng(element, {
    backgroundColor: options?.backgroundColor || '#ffffff',
    pixelRatio: options?.pixelRatio || 2,
    width: options?.width,
    height: options?.height,
  })

  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `${filename}.png`
  a.click()
}
