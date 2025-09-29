import type { CompressionSettings } from '@/types/image'

interface WorkerMessage {
  type: 'compress'
  imageData: ArrayBuffer
  fileName: string
  settings: CompressionSettings
  id: string
}

interface WorkerResponse {
  type: 'progress' | 'success' | 'error'
  id: string
  data?: {
    compressedData: ArrayBuffer
    originalSize: number
    compressedSize: number
    dimensions: { width: number; height: number }
  }
  progress?: number
  error?: string
}

const calculateDimensions = (
  originalWidth: number,
  originalHeight: number,
  maxWidth?: number,
  maxHeight?: number
): { width: number; height: number } => {
  if (!maxWidth && !maxHeight) {
    return { width: originalWidth, height: originalHeight }
  }

  let newWidth = originalWidth
  let newHeight = originalHeight

  if (maxWidth && originalWidth > maxWidth) {
    newWidth = maxWidth
    newHeight = (originalHeight * maxWidth) / originalWidth
  }

  if (maxHeight && newHeight > maxHeight) {
    newHeight = maxHeight
    newWidth = (newWidth * maxHeight) / newHeight
  }

  return {
    width: Math.round(newWidth),
    height: Math.round(newHeight)
  }
}

const createCanvas = (width: number, height: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } => {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建Canvas上下文')
  }
  return { canvas, ctx }
}

const loadImage = (arrayBuffer: ArrayBuffer): Promise<ImageBitmap> => {
  return new Promise((resolve, reject) => {
    const blob = new Blob([arrayBuffer])
    createImageBitmap(blob)
      .then(resolve)
      .catch(reject)
  })
}

const canvasToBlob = (canvas: OffscreenCanvas, format: string, quality: number): Promise<Blob> => {
  const mimeType = format === 'jpeg' ? 'image/jpeg' :
                   format === 'png' ? 'image/png' :
                   format === 'webp' ? 'image/webp' : 'image/jpeg'

  return canvas.convertToBlob({
    type: mimeType,
    quality: quality / 100
  })
}

const compressImage = async (
  imageData: ArrayBuffer,
  settings: CompressionSettings,
  onProgress: (progress: number) => void
): Promise<{
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
}> => {
  try {
    onProgress(10)

    // 加载图片
    const imageBitmap = await loadImage(imageData)
    onProgress(30)

    // 计算新尺寸
    const newDimensions = calculateDimensions(
      imageBitmap.width,
      imageBitmap.height,
      settings.maxWidth,
      settings.maxHeight
    )
    onProgress(40)

    // 创建Canvas并绘制
    const { canvas, ctx } = createCanvas(newDimensions.width, newDimensions.height)

    // 绘制图片到Canvas
    ctx.drawImage(imageBitmap, 0, 0, newDimensions.width, newDimensions.height)
    onProgress(60)

    // 转换为Blob
    const blob = await canvasToBlob(canvas, settings.format, settings.quality)
    onProgress(80)

    // 转换为ArrayBuffer
    const compressedData = await blob.arrayBuffer()
    onProgress(100)

    return {
      compressedData,
      originalSize: imageData.byteLength,
      compressedSize: compressedData.byteLength,
      dimensions: newDimensions
    }
  } catch (error) {
    throw new Error(`压缩失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, imageData, settings, id } = event.data

  if (type === 'compress') {
    try {
      const result = await compressImage(imageData, settings, (progress) => {
        const response: WorkerResponse = {
          type: 'progress',
          id,
          progress
        }
        self.postMessage(response)
      })

      const response: WorkerResponse = {
        type: 'success',
        id,
        data: result
      }
      self.postMessage(response)
    } catch (error) {
      const response: WorkerResponse = {
        type: 'error',
        id,
        error: error instanceof Error ? error.message : '压缩失败'
      }
      self.postMessage(response)
    }
  }
}

export {}