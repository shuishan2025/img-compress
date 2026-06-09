/**
 * 平台无关的压缩核心
 *
 * 流水线:@jsquash decode → img-ops(EXIF 方向 + Lanczos3 缩放) → @jsquash encode
 *
 * 不依赖任何浏览器专有 API。解码兜底、wasm 初始化等平台相关能力由 `hooks` 注入,
 * 因此浏览器 app(`smartCompressor`)和 Node CLI 都能复用本模块。
 */

import { wasmCodecLoader } from '@/services/wasmCodecLoader'
import {
  transform,
  readOrientation,
  orientedDimensions,
  configureImageOps,
  FILTER_LANCZOS3
} from '@/services/imageOps'
import type { CompressionSettings, CompressHooks, CoreResult, OutputFormat, RawImage } from './types'

export async function compressImage(
  input: Uint8Array,
  settings: CompressionSettings,
  hooks: CompressHooks = {}
): Promise<CoreResult> {
  const { onProgress, decodeFallback, imageOpsInit, label } = hooks

  if (imageOpsInit !== undefined) {
    configureImageOps(imageOpsInit)
  }

  onProgress?.(5)
  const normalized = { ...settings, quality: clampQuality(settings.quality) }

  // 0. 解析输出格式('original' = 保持原文件格式)
  const outputFormat = resolveOutputFormat(normalized.format, input)

  // 1. EXIF orientation(必须在解码前从原始字节读)
  const orientation = await readOrientationSafe(input)
  onProgress?.(15)

  // 2. 解码为 RGBA(@jsquash 优先,失败走注入的兜底)
  const { image: decoded, decodedVia } = await decode(input, decodeFallback, label)
  onProgress?.(45)

  // 3. 计算目标尺寸(在「已旋转」坐标系下)
  const oriented = await orientedDimensions(decoded.width, decoded.height, orientation)
  const target = calculateDimensions(
    oriented.width,
    oriented.height,
    normalized.maxWidth,
    normalized.maxHeight
  )
  onProgress?.(55)

  // 4. 方向校正 + 高质量缩放(img-ops)
  const srcRGBA = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength)
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
  const outImage: RawImage = { data: outRGBA, width: target.width, height: target.height }
  const codec = await wasmCodecLoader.getCodec(outputFormat)
  if (!codec) {
    throw new Error(`WASM codec not available for format: ${outputFormat}`)
  }

  const data = await codec.encode(outImage, prepareWASMOptions(outputFormat, normalized.quality))
  onProgress?.(100)

  const codecName = wasmCodecLoader.getCodecName(outputFormat) || outputFormat
  return {
    data,
    originalSize: input.byteLength,
    compressedSize: data.byteLength,
    dimensions: target,
    format: outputFormat,
    codec: codecName,
    decodedVia
  }
}

/** 解析输出格式:'original' 时用 magic-bytes 检测原文件格式 */
function resolveOutputFormat(format: CompressionSettings['format'], input: Uint8Array): OutputFormat {
  if (format !== 'original') return format
  const detected = detectInputFormat(input)
  if (detected) return detected as OutputFormat
  throw new Error('无法识别原文件格式,请手动指定输出格式')
}

/**
 * 解码图片为 RGBA。优先 @jsquash;不支持或失败时走注入的兜底(并打日志)。
 * 若未注入兜底,则解码失败直接抛错(Node 默认无兜底)。
 */
async function decode(
  input: Uint8Array,
  decodeFallback: CompressHooks['decodeFallback'],
  label?: string
): Promise<{ image: RawImage; decodedVia: 'wasm' | 'canvas' }> {
  const format = detectInputFormat(input)
  const ctx = label ? `文件: ${label}, ` : ''

  if (format && wasmCodecLoader.isDecodeSupported(format)) {
    try {
      const image = await wasmCodecLoader.decode(format, toArrayBuffer(input))
      return { image, decodedVia: 'wasm' }
    } catch (error) {
      if (!decodeFallback) throw error
      console.warn(`[img-compress] 降级到解码兜底 — @jsquash 解码失败 (${ctx}格式: ${format})`, error)
    }
  } else {
    if (!decodeFallback) {
      throw new Error(`无 WASM 解码器且未注入兜底 (${ctx}检测格式: ${format ?? '未知'})`)
    }
    console.warn(`[img-compress] 降级到解码兜底 — 无 @jsquash 解码器 (${ctx}检测格式: ${format ?? '未知'})`)
  }

  const image = await decodeFallback(input, format)
  return { image, decodedVia: 'canvas' }
}

/**
 * 通过 magic bytes 嗅探输入格式
 */
export function detectInputFormat(buffer: Uint8Array): string | null {
  const b = buffer
  if (b.length < 12) return null

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  // WebP: "RIFF"...."WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return 'webp'
  }
  // AVIF / HEIF: ....ftyp + 品牌
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
    if (brand === 'avif' || brand === 'avis' || brand === 'mif1' || brand === 'msf1') return 'avif'
  }

  return null
}

async function readOrientationSafe(input: Uint8Array): Promise<number> {
  try {
    return await readOrientation(input)
  } catch (error) {
    console.warn('[img-compress] 读取 EXIF orientation 失败,按 1 处理:', error)
    return 1
  }
}

function prepareWASMOptions(format: OutputFormat, quality: number): Record<string, unknown> {
  const defaultOptions = wasmCodecLoader.getDefaultOptions(format)
  const options: Record<string, unknown> = { ...defaultOptions }

  switch (format) {
    case 'jpeg':
    case 'webp':
    case 'avif':
      options.quality = clampQuality(quality)
      break
    case 'png':
      // PNG 无损,质量设置无效
      break
  }

  return options
}

export function clampQuality(value: number): number {
  if (Number.isNaN(value)) return 90
  return Math.min(Math.max(Math.round(value), 1), 100)
}

export function calculateDimensions(
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

/** 取得独占、尺寸精确的 ArrayBuffer(@jsquash decode 入参需要 ArrayBuffer) */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data.buffer as ArrayBuffer
  }
  return data.slice().buffer as ArrayBuffer
}
