/**
 * 智能图片压缩服务
 * 支持 WASM 优先 + Canvas 降级策略
 */

import { wasmCodecLoader } from './wasmCodecLoader'
import type { CompressionSettings } from '@/types/image'

export interface CompressionResult {
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
  method: 'wasm' | 'canvas'
  codec?: string
}

export interface SmartCompressorOptions {
  preferWASM: boolean
  enablePreload: boolean
  maxWASMSize: number // 超过此大小使用Canvas (bytes)
  fallbackToCanvas: boolean
}

export class SmartCompressor {
  private options: SmartCompressorOptions
  private wasmInitialized = false

  constructor(options: Partial<SmartCompressorOptions> = {}) {
    this.options = {
      preferWASM: true,
      enablePreload: true,
      maxWASMSize: 50 * 1024 * 1024, // 50MB
      fallbackToCanvas: true,
      ...options
    }

    if (this.options.enablePreload) {
      this.initializeWASM()
    }
  }

  /**
   * 智能压缩图片
   */
  async compress(
    imageData: ArrayBuffer,
    settings: CompressionSettings,
    onProgress?: (progress: number) => void
  ): Promise<CompressionResult> {
    onProgress?.(5)

    const shouldUseWASM = this.shouldUseWASM(imageData, settings)

    if (shouldUseWASM) {
      try {
        onProgress?.(10)
        const result = await this.compressWithWASM(imageData, settings, onProgress)
        console.log(`Compressed with WASM (${result.codec}): ${result.originalSize} → ${result.compressedSize} bytes`)
        return result
      } catch (error) {
        console.warn('WASM compression failed, falling back to Canvas:', error)
        if (!this.options.fallbackToCanvas) {
          throw error
        }
      }
    }

    // 降级到Canvas方案
    console.log('Using Canvas compression fallback')
    return await this.compressWithCanvas(imageData, settings, onProgress)
  }

  /**
   * 使用WASM压缩
   */
  private async compressWithWASM(
    imageData: ArrayBuffer,
    settings: CompressionSettings,
    onProgress?: (progress: number) => void
  ): Promise<CompressionResult> {
    onProgress?.(15)

    // 获取WASM编码器
    const codec = await wasmCodecLoader.getCodec(settings.format)
    if (!codec) {
      throw new Error(`WASM codec not available for format: ${settings.format}`)
    }

    onProgress?.(25)

    // 解码原始图片
    const imageBitmap = await createImageBitmap(new Blob([imageData]))
    onProgress?.(35)

    // 计算目标尺寸
    const dimensions = this.calculateDimensions(
      imageBitmap.width,
      imageBitmap.height,
      settings.maxWidth,
      settings.maxHeight
    )

    onProgress?.(45)

    // 使用Canvas准备图片数据
    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imageBitmap, 0, 0, dimensions.width, dimensions.height)
    imageBitmap.close()

    onProgress?.(60)

    // 获取像素数据
    const imageDataObj = ctx.getImageData(0, 0, dimensions.width, dimensions.height)
    const rgbaData = new Uint8Array(imageDataObj.data)

    onProgress?.(70)

    // 准备WASM编码选项
    const codecOptions = this.prepareWASMOptions(settings)

    onProgress?.(80)

    // 使用WASM编码
    const compressedData = await codec.encode(rgbaData, {
      ...codecOptions,
      width: dimensions.width,
      height: dimensions.height
    })

    onProgress?.(95)

    // 清理Canvas
    canvas.width = canvas.height = 0

    onProgress?.(100)

    return {
      compressedData: compressedData.buffer,
      originalSize: imageData.byteLength,
      compressedSize: compressedData.byteLength,
      dimensions,
      method: 'wasm',
      codec: this.getCodecName(settings.format) || settings.format
    }
  }

  /**
   * 使用Canvas压缩 (降级方案)
   */
  private async compressWithCanvas(
    imageData: ArrayBuffer,
    settings: CompressionSettings,
    onProgress?: (progress: number) => void
  ): Promise<CompressionResult> {
    onProgress?.(15)

    const imageBitmap = await createImageBitmap(new Blob([imageData]))
    onProgress?.(30)

    const dimensions = this.calculateDimensions(
      imageBitmap.width,
      imageBitmap.height,
      settings.maxWidth,
      settings.maxHeight
    )

    onProgress?.(50)

    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(imageBitmap, 0, 0, dimensions.width, dimensions.height)
    imageBitmap.close()

    onProgress?.(70)

    // 处理格式映射
    let mimeType = this.getMimeType(settings.format)
    let quality = settings.quality / 100

    // AVIF降级为WebP
    if (settings.format === 'avif') {
      mimeType = 'image/webp'
      console.warn('AVIF not supported in Canvas, using WebP instead')
    }

    onProgress?.(90)

    const compressedBlob = await canvas.convertToBlob({
      type: mimeType,
      quality: mimeType !== 'image/png' ? quality : undefined
    })

    const compressedArrayBuffer = await compressedBlob.arrayBuffer()

    // 清理Canvas
    canvas.width = canvas.height = 0

    onProgress?.(100)

    return {
      compressedData: compressedArrayBuffer,
      originalSize: imageData.byteLength,
      compressedSize: compressedArrayBuffer.byteLength,
      dimensions,
      method: 'canvas'
    }
  }

  /**
   * 判断是否应该使用WASM
   */
  private shouldUseWASM(imageData: ArrayBuffer, settings: CompressionSettings): boolean {
    if (!this.options.preferWASM) {
      return false
    }

    // 检查文件大小限制
    if (imageData.byteLength > this.options.maxWASMSize) {
      console.log(`Image too large for WASM (${imageData.byteLength} > ${this.options.maxWASMSize}), using Canvas`)
      return false
    }

    // 检查格式支持
    if (!wasmCodecLoader.isFormatSupported(settings.format)) {
      console.log(`Format ${settings.format} not supported by WASM, using Canvas`)
      return false
    }

    return true
  }

  /**
   * 准备WASM编码选项
   */
  private prepareWASMOptions(settings: CompressionSettings): any {
    const defaultOptions = wasmCodecLoader.getDefaultOptions(settings.format)

    const options = { ...defaultOptions }

    // 映射通用设置到具体编码器选项
    switch (settings.format) {
      case 'jpeg':
        options.quality = settings.quality
        break
      case 'webp':
        options.quality = settings.quality
        break
      case 'avif':
        // AVIF使用CQ级别，需要转换
        options.cqLevel = Math.round((100 - settings.quality) * 0.63)
        break
      case 'png':
        // PNG是无损格式，质量设置无效
        break
    }

    return options
  }

  /**
   * 获取MIME类型
   */
  private getMimeType(format: string): string {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        return 'image/jpeg'
      case 'png':
        return 'image/png'
      case 'webp':
        return 'image/webp'
      case 'avif':
        return 'image/avif'
      default:
        return 'image/jpeg'
    }
  }

  /**
   * 根据格式获取编码器名称
   */
  private getCodecName(format: string): string | null {
    return wasmCodecLoader.getCodecName ? wasmCodecLoader.getCodecName(format) : null
  }

  /**
   * 计算目标尺寸
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth?: number,
    maxHeight?: number
  ): { width: number; height: number } {
    if (!maxWidth && !maxHeight) {
      return { width: originalWidth, height: originalHeight }
    }

    let newWidth = originalWidth
    let newHeight = originalHeight

    if (maxWidth && originalWidth > maxWidth) {
      newHeight = (originalHeight * maxWidth) / originalWidth
      newWidth = maxWidth
    }

    if (maxHeight && newHeight > maxHeight) {
      newWidth = (newWidth * maxHeight) / newHeight
      newHeight = maxHeight
    }

    return {
      width: Math.round(newWidth),
      height: Math.round(newHeight)
    }
  }

  /**
   * 初始化WASM环境
   */
  private async initializeWASM(): Promise<void> {
    if (this.wasmInitialized) {
      return
    }

    try {
      console.log('Initializing WASM codecs...')
      await wasmCodecLoader.preloadCommonCodecs()
      this.wasmInitialized = true
      console.log('WASM codecs ready')
    } catch (error) {
      console.warn('Failed to initialize WASM codecs:', error)
      // 不抛出错误，允许降级到Canvas
    }
  }

  /**
   * 手动预加载WASM模块
   */
  async preloadWASM(): Promise<void> {
    await this.initializeWASM()
  }

  /**
   * 获取支持的格式列表
   */
  getSupportedFormats(): string[] {
    const wasmFormats = wasmCodecLoader.getSupportedFormats()
    const canvasFormats = ['jpeg', 'png', 'webp']

    // 合并并去重
    return [...new Set([...wasmFormats, ...canvasFormats])]
  }

  /**
   * 获取压缩统计信息
   */
  getStats(): {
    wasmInitialized: boolean
    supportedFormats: string[]
    preferredMethod: string
  } {
    return {
      wasmInitialized: this.wasmInitialized,
      supportedFormats: this.getSupportedFormats(),
      preferredMethod: this.options.preferWASM ? 'WASM' : 'Canvas'
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    wasmCodecLoader.dispose()
    this.wasmInitialized = false
  }
}

// 全局单例
export const smartCompressor = new SmartCompressor()