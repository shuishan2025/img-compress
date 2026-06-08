/**
 * 封装自研 Rust→WASM 模块 `img-ops`
 *
 * 该模块只负责 @jsquash 做不到的两件事:
 *   1. EXIF 方向校正(解码器输出的是不带方向的裸像素)
 *   2. 高质量 Lanczos3 缩放(优于浏览器 Canvas 双线性)
 *
 * 编码/解码仍由 @jsquash 负责。
 */

import init, {
  transform as wasmTransform,
  read_orientation as wasmReadOrientation,
  oriented_dimensions as wasmOrientedDimensions
} from '@/wasm/img-ops/img_ops.js'

// 缩放滤镜,需与 Rust 侧常量保持一致
export const FILTER_LANCZOS3 = 0
export const FILTER_BILINEAR = 1

let initPromise: Promise<void> | null = null

/**
 * 懒加载并初始化 img-ops WASM 模块(幂等)
 */
export async function ensureImageOps(): Promise<void> {
  if (!initPromise) {
    initPromise = init()
      .then(() => undefined)
      .catch((error) => {
        // 初始化失败时重置,允许后续重试
        initPromise = null
        throw error
      })
  }
  return initPromise
}

/**
 * 从原始文件字节读取 EXIF orientation(1-8);无 EXIF 时返回 1
 */
export async function readOrientation(fileBytes: Uint8Array): Promise<number> {
  await ensureImageOps()
  return wasmReadOrientation(fileBytes)
}

/**
 * 根据源尺寸和 orientation 计算「已旋转」后的尺寸(orientation 5-8 会交换宽高)
 */
export async function orientedDimensions(
  srcW: number,
  srcH: number,
  orientation: number
): Promise<{ width: number; height: number }> {
  await ensureImageOps()
  const dims = wasmOrientedDimensions(srcW, srcH, orientation)
  return { width: dims[0], height: dims[1] }
}

/**
 * 应用方向校正并缩放
 *
 * @param targetW/targetH 目标尺寸,需以「已旋转」坐标系表达(由调用方基于
 *        orientedDimensions 的结果计算)
 * @returns 处理后的 RGBA 像素(长度 = targetW * targetH * 4)
 */
export async function transform(
  rgba: Uint8Array,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  orientation: number,
  filter: number = FILTER_LANCZOS3
): Promise<Uint8Array> {
  await ensureImageOps()
  return wasmTransform(rgba, srcW, srcH, targetW, targetH, orientation, filter)
}
