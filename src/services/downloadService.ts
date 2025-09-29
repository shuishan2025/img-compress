import JSZip from 'jszip'
import type { ImageFile } from '@/types/image'

class DownloadService {
  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  private getFileExtension(format: string): string {
    switch (format) {
      case 'jpeg':
        return 'jpg'
      case 'png':
        return 'png'
      case 'webp':
        return 'webp'
      default:
        return 'jpg'
    }
  }

  private generateFilename(originalName: string, format: string): string {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
    const extension = this.getFileExtension(format)
    return `${nameWithoutExt}_compressed.${extension}`
  }

  downloadSingle(image: ImageFile, format: string = 'jpeg'): void {
    if (!image.compressedBlob) {
      throw new Error('图片尚未压缩完成')
    }

    const filename = this.generateFilename(image.file.name, format)
    this.downloadBlob(image.compressedBlob, filename)
  }

  async downloadAsZip(
    images: ImageFile[],
    format: string = 'jpeg',
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const completedImages = images.filter(
      image => image.status === 'completed' && image.compressedBlob
    )

    if (completedImages.length === 0) {
      throw new Error('没有可下载的压缩图片')
    }

    const zip = new JSZip()
    const total = completedImages.length

    // 添加所有图片到ZIP
    completedImages.forEach((image, index) => {
      if (image.compressedBlob) {
        const filename = this.generateFilename(image.file.name, format)
        zip.file(filename, image.compressedBlob)
      }

      if (onProgress) {
        onProgress(Math.round(((index + 1) / total) * 50)) // 前50%为添加文件
      }
    })

    // 生成ZIP文件
    try {
      const zipBlob = await zip.generateAsync(
        {
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: {
            level: 6
          }
        },
        (metadata) => {
          if (onProgress) {
            // 后50%为生成ZIP
            onProgress(50 + Math.round(metadata.percent / 2))
          }
        }
      )

      // 下载ZIP文件
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
      const zipFilename = `compressed_images_${timestamp}.zip`
      this.downloadBlob(zipBlob, zipFilename)

      if (onProgress) {
        onProgress(100)
      }
    } catch (error) {
      throw new Error('生成ZIP文件失败: ' + (error as Error).message)
    }
  }

  async createZipPreview(
    images: ImageFile[],
    format: string = 'jpeg'
  ): Promise<{ filename: string; size: number; count: number }> {
    const completedImages = images.filter(
      image => image.status === 'completed' && image.compressedBlob
    )

    if (completedImages.length === 0) {
      throw new Error('没有可预览的压缩图片')
    }

    const totalSize = completedImages.reduce((sum, image) => {
      return sum + (image.compressedSize || 0)
    }, 0)

    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `compressed_images_${timestamp}.zip`

    return {
      filename,
      size: totalSize,
      count: completedImages.length
    }
  }

  // 批量下载单张图片（不打包）
  downloadMultiple(images: ImageFile[], format: string = 'jpeg'): void {
    const completedImages = images.filter(
      image => image.status === 'completed' && image.compressedBlob
    )

    if (completedImages.length === 0) {
      throw new Error('没有可下载的压缩图片')
    }

    // 逐个下载，间隔一点时间避免浏览器阻止
    completedImages.forEach((image, index) => {
      setTimeout(() => {
        this.downloadSingle(image, format)
      }, index * 100) // 每100ms下载一个
    })
  }

  // 获取所有已完成图片的统计信息
  getCompletedImagesStats(images: ImageFile[]): {
    count: number
    totalOriginalSize: number
    totalCompressedSize: number
    totalSaved: number
    averageCompressionRatio: number
  } {
    const completedImages = images.filter(image => image.status === 'completed')

    if (completedImages.length === 0) {
      return {
        count: 0,
        totalOriginalSize: 0,
        totalCompressedSize: 0,
        totalSaved: 0,
        averageCompressionRatio: 0
      }
    }

    const totalOriginalSize = completedImages.reduce((sum, image) => sum + image.originalSize, 0)
    const totalCompressedSize = completedImages.reduce((sum, image) => sum + (image.compressedSize || 0), 0)
    const totalSaved = totalOriginalSize - totalCompressedSize
    const averageCompressionRatio = totalCompressedSize / totalOriginalSize

    return {
      count: completedImages.length,
      totalOriginalSize,
      totalCompressedSize,
      totalSaved,
      averageCompressionRatio
    }
  }
}

export const downloadService = new DownloadService()