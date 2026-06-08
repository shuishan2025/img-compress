/**
 * WASM编码器动态加载管理器
 * 支持按需加载、错误降级、性能优化
 */

import type { EncodeOptions as MozjpegEncodeOptions } from '@jsquash/jpeg/meta.js'
import { defaultOptions as mozjpegDefaultOptions } from '@jsquash/jpeg/meta.js'
import type { EncodeOptions as WebpEncodeOptions } from '@jsquash/webp/meta.js'
import { defaultOptions as webpDefaultOptions } from '@jsquash/webp/meta.js'
import type { EncodeOptions as AvifEncodeOptions } from '@jsquash/avif/meta.js'
import { defaultOptions as avifDefaultOptions } from '@jsquash/avif/meta.js'
import type { OptimiseOptions as OxiPngOptions } from '@jsquash/oxipng/meta.js'
import { defaultOptions as oxipngDefaultOptions } from '@jsquash/oxipng/meta.js'
import type { RawImage } from '@/core/types'

export interface CodecModule<TOptions extends object = Record<string, unknown>> {
  encode: (imageData: RawImage, options: Partial<TOptions>) => Promise<Uint8Array>
  decode?: (data: Uint8Array) => Promise<RawImage>
}

// 将 RawImage 转为真正的 ImageData 实例(浏览器原生 / Node polyfill 提供 global)。
// 仅 oxipng 需要,因其用 `instanceof ImageData` 区分入参类型。
function toImageData(image: RawImage): ImageData {
  const ImageDataCtor = (globalThis as { ImageData?: typeof ImageData }).ImageData
  if (!ImageDataCtor) {
    throw new Error('ImageData 不可用(Node 环境需先注入 ImageData polyfill)')
  }
  if (image instanceof ImageDataCtor) {
    return image
  }
  const clamped =
    image.data instanceof Uint8ClampedArray
      ? image.data
      : new Uint8ClampedArray(image.data.buffer, image.data.byteOffset, image.data.byteLength)
  return new ImageDataCtor(clamped, image.width, image.height)
}

interface CodecInfo<TOptions extends object = Record<string, unknown>> {
  name: string
  formats: string[]
  defaultOptions: TOptions
  priority: number
  loader: () => Promise<CodecModule<TOptions>>
}

const mozjpegConfig: CodecInfo<MozjpegEncodeOptions> = {
  name: 'MozJPEG',
  formats: ['jpeg', 'jpg'],
  defaultOptions: mozjpegDefaultOptions,
  priority: 1,
  loader: async () => {
    const { encode } = await import('@jsquash/jpeg')

    return {
      encode: async (imageData: RawImage, options: Partial<MozjpegEncodeOptions>) => {
        const result = await encode(imageData as unknown as ImageData, options)
        return new Uint8Array(result)
      }
    }
  }
}

const oxipngConfig: CodecInfo<OxiPngOptions> = {
  name: 'OxiPNG',
  formats: ['png'],
  defaultOptions: oxipngDefaultOptions,
  priority: 1,
  loader: async () => {
    const { optimise } = await import('@jsquash/oxipng')

    return {
      encode: async (imageData: RawImage, options: Partial<OxiPngOptions>) => {
        // oxipng 的 optimise 用 `instanceof ImageData` 区分入参(裸 PNG vs 像素),
        // 必须传真正的 ImageData 实例(浏览器原生;Node 由 CLI 注入 polyfill)。
        const result = await optimise(toImageData(imageData), options)
        return new Uint8Array(result)
      }
    }
  }
}

const webpConfig: CodecInfo<WebpEncodeOptions> = {
  name: 'WebP',
  formats: ['webp'],
  defaultOptions: webpDefaultOptions,
  priority: 1,
  loader: async () => {
    const { encode } = await import('@jsquash/webp')

    return {
      encode: async (imageData: RawImage, options: Partial<WebpEncodeOptions>) => {
        const result = await encode(imageData as unknown as ImageData, options)
        return new Uint8Array(result)
      }
    }
  }
}

const avifConfig: CodecInfo<AvifEncodeOptions> = {
  name: 'AVIF',
  formats: ['avif'],
  defaultOptions: avifDefaultOptions,
  priority: 2,
  loader: async () => {
    const { encode } = await import('@jsquash/avif')

    return {
      encode: async (imageData: RawImage, options: Partial<AvifEncodeOptions>) => {
        const result = await encode(imageData as unknown as ImageData, {
          ...options,
          bitDepth: 8
        })
        return new Uint8Array(result)
      }
    }
  }
}

// 支持的编码器配置
const CODEC_CONFIGS: Record<string, CodecInfo<any>> = {
  mozjpeg: mozjpegConfig,
  oxipng: oxipngConfig,
  webp: webpConfig,
  avif: avifConfig
}

// 解码器:输入文件字节 → RGBA 像素(RawImage,浏览器下即 ImageData)
// 注意 oxipng 只编码不解码,PNG 解码用独立的 @jsquash/png
type DecoderFn = (buffer: ArrayBuffer) => Promise<RawImage>

const DECODER_LOADERS: Record<string, () => Promise<DecoderFn>> = {
  jpeg: async () => {
    const { decode } = await import('@jsquash/jpeg')
    return (buffer) => decode(buffer)
  },
  png: async () => {
    const { decode } = await import('@jsquash/png')
    return (buffer) => decode(buffer)
  },
  webp: async () => {
    const { decode } = await import('@jsquash/webp')
    return (buffer) => decode(buffer)
  },
  avif: async () => {
    const { decode } = await import('@jsquash/avif')
    return async (buffer) => {
      const result = await decode(buffer)
      if (!result) {
        throw new Error('AVIF decode returned null')
      }
      return result as RawImage
    }
  }
}

// 输入格式别名归一化
function normalizeDecodeFormat(format: string): string {
  const f = format.toLowerCase()
  return f === 'jpg' ? 'jpeg' : f
}

export class WASMCodecLoader {
  private loadedCodecs = new Map<string, CodecModule>()
  private loadingPromises = new Map<string, Promise<CodecModule>>()
  private loadAttempts = new Map<string, number>()
  private maxRetries = 2

  private loadedDecoders = new Map<string, DecoderFn>()
  private loadingDecoders = new Map<string, Promise<DecoderFn>>()

  /**
   * 是否支持该输入格式的 WASM 解码
   */
  isDecodeSupported(format: string): boolean {
    return normalizeDecodeFormat(format) in DECODER_LOADERS
  }

  /**
   * 使用 @jsquash 解码输入文件字节为 RGBA(RawImage)
   * 失败时抛出,由上层决定是否走解码兜底
   */
  async decode(format: string, buffer: ArrayBuffer): Promise<RawImage> {
    const decoder = await this.getDecoder(format)
    return decoder(buffer)
  }

  private async getDecoder(format: string): Promise<DecoderFn> {
    const key = normalizeDecodeFormat(format)
    const loader = DECODER_LOADERS[key]
    if (!loader) {
      throw new Error(`No WASM decoder available for format: ${format}`)
    }

    if (this.loadedDecoders.has(key)) {
      return this.loadedDecoders.get(key)!
    }

    if (this.loadingDecoders.has(key)) {
      return this.loadingDecoders.get(key)!
    }

    const loadingPromise = loader()
    this.loadingDecoders.set(key, loadingPromise)

    try {
      const decoder = await loadingPromise
      this.loadedDecoders.set(key, decoder)
      return decoder
    } finally {
      this.loadingDecoders.delete(key)
    }
  }

  /**
   * 获取指定格式的编码器
   */
  async getCodec(format: string): Promise<CodecModule | null> {
    const codecName = this.getCodecNamePrivate(format)
    if (!codecName) {
      console.warn(`No WASM codec available for format: ${format}`)
      return null
    }

    // 返回已加载的编码器
    if (this.loadedCodecs.has(codecName)) {
      return this.loadedCodecs.get(codecName)!
    }

    // 返回正在加载的Promise
    if (this.loadingPromises.has(codecName)) {
      try {
        return await this.loadingPromises.get(codecName)!
      } catch (error) {
        console.warn(`Failed to load codec ${codecName}:`, error)
        return null
      }
    }

    // 开始加载新的编码器
    const loadingPromise = this.loadCodec(codecName)
    this.loadingPromises.set(codecName, loadingPromise)

    try {
      const codec = await loadingPromise
      this.loadedCodecs.set(codecName, codec)
      this.loadingPromises.delete(codecName)
      return codec
    } catch (error) {
      this.loadingPromises.delete(codecName)
      console.error(`Failed to load WASM codec ${codecName}:`, error)
      return null
    }
  }

  /**
   * 根据格式获取编码器名称
   */
  getCodecName(format: string): string | null {
    const normalizedFormat = format.toLowerCase()
    for (const [codecName, config] of Object.entries(CODEC_CONFIGS)) {
      if (config.formats.includes(normalizedFormat)) {
        return codecName
      }
    }
    return null
  }

  /**
   * 根据格式获取编码器名称 (私有方法)
   */
  private getCodecNamePrivate(format: string): string | null {
    return this.getCodecName(format)
  }

  /**
   * 加载指定的WASM编码器
   */
  private async loadCodec(codecName: string): Promise<CodecModule> {
    const config = CODEC_CONFIGS[codecName]
    if (!config) {
      throw new Error(`Unknown codec: ${codecName}`)
    }

    const attempts = this.loadAttempts.get(codecName) || 0
    if (attempts >= this.maxRetries) {
      throw new Error(`Max retry attempts reached for codec: ${codecName}`)
    }

    this.loadAttempts.set(codecName, attempts + 1)

    try {
      console.log(`Loading WASM codec: ${config.name}`)

      const wasmModule = await config.loader()

      console.log(`Successfully loaded WASM codec: ${config.name}`)

      return {
        encode: async (imageData: RawImage, options: Record<string, unknown>) => {
          const mergedOptions = { ...config.defaultOptions, ...options }
          return wasmModule.encode(imageData, mergedOptions)
        }
      }
    } catch (error) {
      console.error(`Failed to load codec ${codecName}:`, error)
      throw error
    }
  }

  /**
   * 预加载常用编码器
   */
  async preloadCommonCodecs(): Promise<void> {
    const commonCodecs = ['mozjpeg', 'webp'] // 优先加载最常用的

    const promises = commonCodecs.map(async (codecName) => {
      try {
        const format = CODEC_CONFIGS[codecName].formats[0]
        await this.getCodec(format)
        console.log(`Preloaded codec: ${codecName}`)
      } catch (error) {
        console.warn(`Failed to preload codec ${codecName}:`, error)
      }
    })

    await Promise.allSettled(promises)
  }

  /**
   * 获取编码器默认选项
   */
  getDefaultOptions(format: string): any {
    const codecName = this.getCodecNamePrivate(format)
    if (!codecName) {
      return {}
    }

    const defaults = CODEC_CONFIGS[codecName].defaultOptions
    return { ...defaults }
  }

  /**
   * 检查是否支持指定格式
   */
  isFormatSupported(format: string): boolean {
    return this.getCodecNamePrivate(format) !== null
  }

  /**
   * 获取所有支持的格式
   */
  getSupportedFormats(): string[] {
    return Object.values(CODEC_CONFIGS)
      .flatMap(config => config.formats)
      .filter((format, index, arr) => arr.indexOf(format) === index)
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.loadedCodecs.clear()
    this.loadingPromises.clear()
    this.loadAttempts.clear()
    this.loadedDecoders.clear()
    this.loadingDecoders.clear()
  }
}

// 全局单例
export const wasmCodecLoader = new WASMCodecLoader()
