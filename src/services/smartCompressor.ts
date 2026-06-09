/**
 * 浏览器侧压缩宿主
 *
 * 真正的流水线在平台无关核心 `@/core/compress`。本文件只负责:
 *  - 注入浏览器专有的「薄解码兜底」(createImageBitmap / OffscreenCanvas)
 *  - 适配 Worker 既有契约(ArrayBuffer 进出、method 字段等)
 *  - 预加载常用编码器
 */

import { wasmCodecLoader } from './wasmCodecLoader'
import { compressImage } from '@/core/compress'
import type { CompressionSettings, OutputFormat, RawImage } from '@/core/types'

export interface CompressionResult {
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
  method: 'wasm' | 'canvas'
  format: OutputFormat
  codec?: string
  decodedVia?: 'wasm' | 'canvas'
}

export interface SmartCompressorOptions {
  enablePreload: boolean
  /** 是否允许在 @jsquash 解码失败时用 Canvas 兜底 */
  fallbackToCanvas: boolean
}

export class SmartCompressor {
  private options: SmartCompressorOptions
  private wasmInitialized = false

  constructor(options: Partial<SmartCompressorOptions> = {}) {
    this.options = {
      enablePreload: true,
      fallbackToCanvas: true,
      ...options
    }

    if (this.options.enablePreload) {
      this.initializeWASM()
    }
  }

  /**
   * 压缩图片
   */
  async compress(
    imageData: ArrayBuffer,
    settings: CompressionSettings,
    onProgress?: (progress: number) => void,
    fileName?: string
  ): Promise<CompressionResult> {
    const input = new Uint8Array(imageData)

    const result = await compressImage(input, settings, {
      onProgress,
      label: fileName,
      decodeFallback: this.options.fallbackToCanvas ? this.canvasDecodeFallback : undefined
    })

    console.log(
      `Compressed (decode=${result.decodedVia}, encode=${result.codec}): ` +
        `${result.originalSize} → ${result.compressedSize} bytes`
    )

    return {
      compressedData: this.toArrayBuffer(result.data),
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      dimensions: result.dimensions,
      method: 'wasm',
      format: result.format,
      codec: result.codec,
      decodedVia: result.decodedVia
    }
  }

  /**
   * 薄解码兜底:仅把文件字节解码为 RGBA,不参与缩放/编码。
   * 用 `imageOrientation: 'none'` 拿未旋转的裸像素,方向统一交给 img-ops。
   */
  private canvasDecodeFallback = async (bytes: Uint8Array): Promise<RawImage> => {
    const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'none' })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      throw new Error('无法创建 Canvas 2D 上下文')
    }
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const decoded = ctx.getImageData(0, 0, canvas.width, canvas.height)
    canvas.width = canvas.height = 0
    return decoded
  }

  private toArrayBuffer(data: Uint8Array): ArrayBuffer {
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer as ArrayBuffer
    }
    return data.slice().buffer as ArrayBuffer
  }

  private async initializeWASM(): Promise<void> {
    if (this.wasmInitialized) return

    try {
      await wasmCodecLoader.preloadCommonCodecs()
      this.wasmInitialized = true
    } catch (error) {
      console.warn('Failed to initialize WASM codecs:', error)
    }
  }

  async preloadWASM(): Promise<void> {
    await this.initializeWASM()
  }

  getSupportedFormats(): string[] {
    return wasmCodecLoader.getSupportedFormats()
  }

  getStats(): { wasmInitialized: boolean; supportedFormats: string[] } {
    return {
      wasmInitialized: this.wasmInitialized,
      supportedFormats: this.getSupportedFormats()
    }
  }

  dispose(): void {
    wasmCodecLoader.dispose()
    this.wasmInitialized = false
  }
}

// 全局单例
export const smartCompressor = new SmartCompressor()
