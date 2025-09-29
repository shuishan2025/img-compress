/**
 * WASM编码器动态加载管理器
 * 支持按需加载、错误降级、性能优化
 */

export interface CodecModule {
  encode: (imageData: Uint8Array, options: any) => Promise<Uint8Array>
  decode?: (data: Uint8Array) => Promise<ImageData>
}

export interface CodecInfo {
  name: string
  formats: string[]
  wasmUrl: string
  jsUrl: string
  defaultOptions: any
  priority: number
}

// 支持的编码器配置
const CODEC_CONFIGS: Record<string, CodecInfo> = {
  mozjpeg: {
    name: 'MozJPEG',
    formats: ['jpeg', 'jpg'],
    wasmUrl: '@squoosh/lib/codecs/mozjpeg/enc/mozjpeg_enc.wasm',
    jsUrl: '@squoosh/lib/codecs/mozjpeg/enc/mozjpeg_enc.js',
    defaultOptions: {
      quality: 80,
      baseline: false,
      arithmetic: false,
      progressive: true,
      optimize_coding: true,
      smoothing: 0,
      color_space: 3,
      quant_table: 3,
      trellis_multipass: false,
      trellis_opt_zero: false,
      trellis_opt_table: false,
      trellis_loops: 1,
      auto_subsample: true,
      chroma_subsample: 2,
      separate_chroma_quality: false,
      chroma_quality: 75
    },
    priority: 1
  },
  oxipng: {
    name: 'OxiPNG',
    formats: ['png'],
    wasmUrl: '@squoosh/lib/codecs/oxipng/enc/oxipng_enc.wasm',
    jsUrl: '@squoosh/lib/codecs/oxipng/enc/oxipng_enc.js',
    defaultOptions: {
      level: 3,
      interlace: false
    },
    priority: 1
  },
  webp: {
    name: 'WebP',
    formats: ['webp'],
    wasmUrl: '@squoosh/lib/codecs/webp/enc/webp_enc.wasm',
    jsUrl: '@squoosh/lib/codecs/webp/enc/webp_enc.js',
    defaultOptions: {
      quality: 80,
      target_size: 0,
      target_PSNR: 0,
      method: 4,
      sns_strength: 50,
      filter_strength: 60,
      filter_sharpness: 0,
      filter_type: 1,
      partitions: 0,
      segments: 4,
      pass: 1,
      show_compressed: 0,
      preprocessing: 0,
      autofilter: 0,
      partition_limit: 0,
      alpha_compression: 1,
      alpha_filtering: 1,
      alpha_quality: 100,
      lossless: 0,
      exact: 0,
      image_hint: 0,
      emulate_jpeg_size: 0,
      thread_level: 0,
      low_memory: 0,
      near_lossless: 100,
      use_delta_palette: 0,
      use_sharp_yuv: 0
    },
    priority: 1
  },
  avif: {
    name: 'AVIF',
    formats: ['avif'],
    wasmUrl: '@squoosh/lib/codecs/avif/enc/avif_enc.wasm',
    jsUrl: '@squoosh/lib/codecs/avif/enc/avif_enc.js',
    defaultOptions: {
      cqLevel: 33,
      cqAlphaLevel: -1,
      denoiseLevel: 0,
      tileColsLog2: 0,
      tileRowsLog2: 0,
      speed: 6,
      subsample: 1,
      chromaDeltaQ: false,
      sharpness: 0,
      tune: 0
    },
    priority: 2
  }
}

export class WASMCodecLoader {
  private loadedCodecs = new Map<string, CodecModule>()
  private loadingPromises = new Map<string, Promise<CodecModule>>()
  private loadAttempts = new Map<string, number>()
  private maxRetries = 2

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

      // 动态导入编码器模块
      const module = await import(/* @vite-ignore */ config.jsUrl)

      if (!module.default) {
        throw new Error(`Invalid codec module: ${codecName}`)
      }

      // 初始化WASM模块
      const wasmModule = await module.default()

      console.log(`Successfully loaded WASM codec: ${config.name}`)

      return {
        encode: async (imageData: Uint8Array, options: any) => {
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
    return codecName ? CODEC_CONFIGS[codecName].defaultOptions : {}
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
  }
}

// 全局单例
export const wasmCodecLoader = new WASMCodecLoader()