/**
 * 平台无关的压缩核心类型
 *
 * 核心 (`src/core/`) 不依赖任何浏览器专有 API(ImageData / OffscreenCanvas /
 * createImageBitmap / Worker),因此可同时被浏览器 app 和 Node CLI 复用。
 * 平台差异通过 `CompressHooks` 注入。
 */

import type { CompressionSettings } from '@/types/image'

export type { CompressionSettings }

/**
 * 裸像素图像 —— 浏览器的 `ImageData` 是它的超集,Node 下用普通对象即可。
 * @jsquash 的 encode/decode 是鸭子类型(只读 data/width/height),所以无需 `ImageData` 全局。
 */
export interface RawImage {
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
}

/**
 * 宿主注入的平台相关能力
 */
export interface CompressHooks {
  onProgress?: (progress: number) => void
  /**
   * 解码兜底:当 @jsquash 无法解码时调用。
   * 浏览器注入 Canvas(createImageBitmap)实现;Node 可不注入(则解码失败直接抛错)。
   */
  decodeFallback?: (bytes: Uint8Array, detectedFormat: string | null) => Promise<RawImage>
  /**
   * 传给 img-ops `init()` 的参数。浏览器留空(默认 fetch wasm);
   * CLI 传 `{ module_or_path: <wasm 字节> }`。
   */
  imageOpsInit?: unknown
  /** 仅用于日志上下文(如文件名) */
  label?: string
}

export interface CoreResult {
  data: Uint8Array
  originalSize: number
  compressedSize: number
  dimensions: { width: number; height: number }
  codec?: string
  /** 解码走的路径:wasm = @jsquash,canvas = 兜底 */
  decodedVia: 'wasm' | 'canvas'
}
