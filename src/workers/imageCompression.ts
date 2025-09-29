import type { CompressionSettings } from '@/types/image'

// Worker环境polyfills
if (typeof globalThis === 'undefined') {
  (self as any).globalThis = self
}

// 动态导入智能压缩服务
let SmartCompressor: any = null
let smartCompressor: any = null

async function loadSmartCompressor() {
  if (!SmartCompressor) {
    try {
      const module = await import('../services/smartCompressor.js')
      SmartCompressor = module.SmartCompressor
      smartCompressor = new SmartCompressor({
        preferWASM: true,
        enablePreload: false, // Worker中手动控制预加载
        fallbackToCanvas: true,
        maxWASMSize: 20 * 1024 * 1024 // 20MB 在Worker中更保守
      })
      console.log('Smart compressor loaded in worker')
    } catch (error) {
      console.error('Failed to load smart compressor:', error)
      throw new Error('无法加载智能压缩服务')
    }
  }
  return smartCompressor
}

interface WorkerMessage {
  type: 'compress'
  imageData: ArrayBuffer
  fileName: string
  settings: CompressionSettings
  id: string
}

interface WorkerResponse {
  type: 'progress' | 'success' | 'error' | 'method_info'
  id: string
  data?: {
    compressedData: ArrayBuffer
    originalSize: number
    compressedSize: number
    dimensions: { width: number; height: number }
    method?: 'wasm' | 'canvas'
    codec?: string
  }
  progress?: number
  error?: string
  method?: string
  codec?: string
}

// 主要压缩函数，使用智能压缩服务
const compressImage = async (
  imageData: ArrayBuffer,
  settings: CompressionSettings,
  onProgress: (progress: number) => void
): Promise<{
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
  method?: 'wasm' | 'canvas'
  codec?: string
}> => {
  try {
    console.log('Starting smart compression...')

    // 加载智能压缩服务
    const compressor = await loadSmartCompressor()

    // 使用智能压缩
    const result = await compressor.compress(imageData, settings, onProgress)

    console.log(`Compression completed using ${result.method}${result.codec ? ` (${result.codec})` : ''}`)

    return {
      compressedData: result.compressedData,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      dimensions: result.dimensions,
      method: result.method,
      codec: result.codec
    }
  } catch (error) {
    console.error('Smart compression error:', error)
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

      // 发送压缩方法信息
      if (result.method) {
        const methodResponse: WorkerResponse = {
          type: 'method_info',
          id,
          method: result.method,
          codec: result.codec
        }
        self.postMessage(methodResponse)
      }

      const response: WorkerResponse = {
        type: 'success',
        id,
        data: {
          compressedData: result.compressedData,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          dimensions: result.dimensions,
          method: result.method,
          codec: result.codec
        }
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