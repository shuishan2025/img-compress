/**
 * 智能图片压缩服务
 *
 * 流水线:@jsquash decode → img-ops(EXIF 方向 + Lanczos3 缩放) → @jsquash encode
 *
 * - decode/encode 由 @jsquash 负责(MozJPEG / libwebp / libaom / oxipng)
 * - 方向校正与高质量缩放由自研 Rust→WASM 模块 img-ops 负责
 * - 仅保留「薄解码兜底」:当 @jsquash 无法解码某些文件时,用 Canvas 解码并打日志
 */

import { wasmCodecLoader } from './wasmCodecLoader'
import { transform, readOrientation, orientedDimensions, FILTER_LANCZOS3 } from './imageOps'
import type { CompressionSettings } from '@/types/image'

export interface CompressionResult {
  compressedData: ArrayBuffer
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
  method: 'wasm' | 'canvas'
  codec?: string
  /** 解码走的路径:wasm = @jsquash,canvas = 薄兜底 */
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
    onProgress?.(5)

    const normalizedSettings = {
      ...settings,
      quality: this.clampQuality(settings.quality)
    }

    // 1. 读取 EXIF orientation(必须在解码前从原始字节读)
    const orientation = await this.readOrientationSafe(imageData)
    onProgress?.(15)

    // 2. 解码为 RGBA(@jsquash 优先,失败走 Canvas 兜底)
    const { imageData: decoded, decodedVia } = await this.decodeImage(imageData, fileName)
    onProgress?.(45)

    // 3. 计算目标尺寸(在「已旋转」坐标系下)
    const oriented = await orientedDimensions(decoded.width, decoded.height, orientation)
    const target = this.calculateDimensions(
      oriented.width,
      oriented.height,
      normalizedSettings.maxWidth,
      normalizedSettings.maxHeight
    )
    onProgress?.(55)

    // 4. 方向校正 + 高质量缩放(img-ops)
    const srcRGBA = new Uint8Array(
      decoded.data.buffer,
      decoded.data.byteOffset,
      decoded.data.byteLength
    )
    const outRGBA = await transform(
      srcRGBA,
      decoded.width,
      decoded.height,
      target.width,
      target.height,
      orientation,
      FILTER_LANCZOS3
    )
    onProgress?.(70)

    // 5. 编码(@jsquash);重编码天然剥离元数据,方向已烘焙进像素
    const outImageData = new ImageData(
      new Uint8ClampedArray(outRGBA.buffer, outRGBA.byteOffset, outRGBA.byteLength),
      target.width,
      target.height
    )

    const codec = await wasmCodecLoader.getCodec(normalizedSettings.format)
    if (!codec) {
      throw new Error(`WASM codec not available for format: ${normalizedSettings.format}`)
    }

    const codecOptions = this.prepareWASMOptions(normalizedSettings)
    const compressedData = await codec.encode(outImageData, codecOptions)
    onProgress?.(100)

    const codecName = this.getCodecName(normalizedSettings.format) || normalizedSettings.format
    console.log(
      `Compressed (decode=${decodedVia}, encode=${codecName}): ` +
        `${imageData.byteLength} → ${compressedData.byteLength} bytes`
    )

    return {
      compressedData: this.toArrayBuffer(compressedData),
      originalSize: imageData.byteLength,
      compressedSize: compressedData.byteLength,
      dimensions: target,
      method: 'wasm',
      codec: codecName,
      decodedVia
    }
  }

  /**
   * 解码图片为 RGBA。优先 @jsquash;不支持或失败时用 Canvas 兜底并打日志。
   */
  private async decodeImage(
    imageData: ArrayBuffer,
    fileName?: string
  ): Promise<{ imageData: ImageData; decodedVia: 'wasm' | 'canvas' }> {
    const format = this.detectInputFormat(imageData)

    if (format && wasmCodecLoader.isDecodeSupported(format)) {
      try {
        const decoded = await wasmCodecLoader.decode(format, imageData)
        return { imageData: decoded, decodedVia: 'wasm' }
      } catch (error) {
        if (!this.options.fallbackToCanvas) {
          throw error
        }
        console.warn(
          `[img-compress] 降级到 Canvas 解码 — @jsquash 解码失败 ` +
            `(文件: ${fileName ?? '未知'}, 格式: ${format})`,
          error
        )
      }
    } else {
      if (!this.options.fallbackToCanvas) {
        throw new Error(`无 WASM 解码器且未启用 Canvas 兜底 (检测格式: ${format ?? '未知'})`)
      }
      console.warn(
        `[img-compress] 降级到 Canvas 解码 — 无 @jsquash 解码器 ` +
          `(文件: ${fileName ?? '未知'}, 检测格式: ${format ?? '未知'})`
      )
    }

    const decoded = await this.canvasDecodeFallback(imageData)
    return { imageData: decoded, decodedVia: 'canvas' }
  }

  /**
   * 薄解码兜底:仅负责把文件字节解码为 RGBA,不参与缩放/编码。
   * 用 `imageOrientation: 'none'` 拿未旋转的裸像素,保证与 @jsquash 解码路径一致,
   * 方向统一交给 img-ops.transform 处理。
   */
  private async canvasDecodeFallback(imageData: ArrayBuffer): Promise<ImageData> {
    const bitmap = await createImageBitmap(new Blob([imageData]), { imageOrientation: 'none' })
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

  /**
   * 通过 magic bytes 嗅探输入格式
   */
  private detectInputFormat(buffer: ArrayBuffer): string | null {
    const b = new Uint8Array(buffer)
    if (b.length < 12) {
      return null
    }

    // JPEG: FF D8 FF
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
      return 'jpeg'
    }
    // PNG: 89 50 4E 47
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
      return 'png'
    }
    // WebP: "RIFF"...."WEBP"
    if (
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    ) {
      return 'webp'
    }
    // AVIF / HEIF: ....ftyp + 品牌
    if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
      if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') {
        return 'avif'
      }
    }

    return null
  }

  private async readOrientationSafe(imageData: ArrayBuffer): Promise<number> {
    try {
      return await readOrientation(new Uint8Array(imageData))
    } catch (error) {
      console.warn('[img-compress] 读取 EXIF orientation 失败,按 1 处理:', error)
      return 1
    }
  }

  /**
   * 准备 WASM 编码选项
   */
  private prepareWASMOptions(settings: CompressionSettings): Record<string, unknown> {
    const defaultOptions = wasmCodecLoader.getDefaultOptions(settings.format)
    const options = { ...defaultOptions }
    const quality = this.clampQuality(settings.quality)

    switch (settings.format) {
      case 'jpeg':
      case 'webp':
      case 'avif':
        options.quality = quality
        break
      case 'png':
        // PNG 无损,质量设置无效
        break
    }

    return options
  }

  private getCodecName(format: string): string | null {
    return wasmCodecLoader.getCodecName ? wasmCodecLoader.getCodecName(format) : null
  }

  /**
   * 质量值归一化到 1-100 整数
   */
  private clampQuality(value: number): number {
    if (Number.isNaN(value)) {
      return 90
    }
    return Math.min(Math.max(Math.round(value), 1), 100)
  }

  /**
   * 计算目标尺寸(保持宽高比)
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
      width: Math.max(1, Math.round(newWidth)),
      height: Math.max(1, Math.round(newHeight))
    }
  }

  private toArrayBuffer(data: Uint8Array): ArrayBuffer {
    // 确保返回独占、尺寸精确的 ArrayBuffer(便于 postMessage transfer)
    if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
      return data.buffer as ArrayBuffer
    }
    return data.slice().buffer as ArrayBuffer
  }

  /**
   * 初始化 / 预加载常用 WASM 编解码器
   */
  private async initializeWASM(): Promise<void> {
    if (this.wasmInitialized) {
      return
    }

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

  getStats(): {
    wasmInitialized: boolean
    supportedFormats: string[]
  } {
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
