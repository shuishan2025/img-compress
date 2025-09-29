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
      case 'avif':
        return 'avif'
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