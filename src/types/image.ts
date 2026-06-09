export interface ImageFile {
  id: string
  file: File
  originalSize: number
  originalDimensions: { width: number; height: number }
  compressedSize?: number
  compressedDimensions?: { width: number; height: number }
  compressionRatio?: number
  originalUrl: string
  compressedUrl?: string
  compressedBlob?: Blob
  status: 'pending' | 'processing' | 'completed' | 'error'
  progress?: number
  error?: string
  compressionMethod?: 'wasm' | 'canvas'
  codec?: string
}

/** 实际可编码的输出格式 */
export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'avif'

export interface CompressionSettings {
  quality: number
  maxWidth?: number
  maxHeight?: number
  /** 'original' = 保持每张图的原始格式;其余为强制指定输出格式 */
  format: OutputFormat | 'original'
  removeMetadata: boolean
}