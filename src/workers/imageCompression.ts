import type { CompressionSettings } from '@/types/image'

// Worker环境polyfills
if (typeof globalThis === 'undefined') {
  (self as any).globalThis = self
}

// 使用 ImageBitmap 进行 Worker 兼容的图片处理
async function canvasCompress(
  imageData: ArrayBuffer,
  settings: CompressionSettings,
  onProgress: (progress: number) => void
): Promise<{
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
}> {
  try {
    onProgress(10)

    // 创建Blob并解码为ImageBitmap (Worker兼容)
    const blob = new Blob([imageData])
    const imageBitmap = await createImageBitmap(blob)

    onProgress(30)

    // 计算新尺寸
    let { width, height } = imageBitmap
    if (settings.maxWidth && width > settings.maxWidth) {
      height = (height * settings.maxWidth) / width
      width = settings.maxWidth
    }
    if (settings.maxHeight && height > settings.maxHeight) {
      width = (width * settings.maxHeight) / height
      height = settings.maxHeight
    }

    const newWidth = Math.round(width)
    const newHeight = Math.round(height)

    onProgress(50)

    // 创建 OffscreenCanvas
    const canvas = new OffscreenCanvas(newWidth, newHeight)
    const ctx = canvas.getContext('2d')!

    // 绘制图像
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight)

    // 释放 ImageBitmap
    imageBitmap.close()

    onProgress(70)

    // 确定输出格式和质量
    let mimeType = 'image/jpeg'
    let quality = settings.quality / 100

    switch (settings.format) {
      case 'png':
        mimeType = 'image/png'
        quality = 1 // PNG不支持质量设置
        break
      case 'webp':
        mimeType = 'image/webp'
        break
      case 'avif':
        // Canvas不支持AVIF，降级为WebP
        mimeType = 'image/webp'
        console.warn('AVIF not supported in Canvas, using WebP instead')
        break
      case 'jpeg':
      default:
        mimeType = 'image/jpeg'
        break
    }

    onProgress(90)

    // 转换为Blob
    const compressedBlob = await canvas.convertToBlob({
      type: mimeType,
      quality: quality
    })

    const compressedArrayBuffer = await compressedBlob.arrayBuffer()

    onProgress(100)

    return {
      compressedData: compressedArrayBuffer,
      originalSize: imageData.byteLength,
      compressedSize: compressedArrayBuffer.byteLength,
      dimensions: { width: newWidth, height: newHeight }
    }

  } catch (error) {
    console.error('Canvas compression error details:', error)
    throw new Error(`图片处理失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

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

// 主要压缩函数，使用Canvas实现
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
    console.log('Starting Canvas-based compression')
    return await canvasCompress(imageData, settings, onProgress)
  } catch (error) {
    console.error('Canvas compression error:', error)
    throw new Error(`压缩失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 处理Worker消息
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
      console.error('Worker compression error:', error)
      const response: WorkerResponse = {
        type: 'error',
        id,
        error: error instanceof Error ? error.message : '压缩失败'
      }
      self.postMessage(response)
    }
  }
}

// 添加全局错误处理
self.onerror = (error) => {
  console.error('Worker global error:', error)
}

self.onunhandledrejection = (event) => {
  console.error('Worker unhandled promise rejection:', event.reason)
}

export {}