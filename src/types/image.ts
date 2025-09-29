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
}

export interface CompressionSettings {
  quality: number
  maxWidth?: number
  maxHeight?: number
  format: 'jpeg' | 'png' | 'webp' | 'avif'
  removeMetadata: boolean
}