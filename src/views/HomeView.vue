<script setup lang="ts">
import { ref, reactive, onBeforeUnmount } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import ImageUpload from '@/components/ImageUpload.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import { compressionService } from '@/services/compressionService'
import { downloadService } from '@/services/downloadService'
import type { ImageFile, CompressionSettings } from '@/types/image'

const images = ref<ImageFile[]>([])
const uploadRef = ref<InstanceType<typeof ImageUpload>>()

const addImages = (newImages: ImageFile[]) => {
  images.value.push(...newImages)
}

const startCompression = async (settings: CompressionSettings) => {
  const pendingImages = images.value.filter(img => img.status === 'pending')

  if (pendingImages.length === 0) {
    ElMessage.warning('没有待压缩的图片')
    return
  }

  uploadRef.value?.setCompressing(true)

  try {
    await compressionService.compressImages(
      pendingImages,
      settings,
      // 进度回调
      (imageId: string, progress: number) => {
        const image = images.value.find(img => img.id === imageId)
        if (image) {
          image.status = 'processing'
          image.progress = progress
        }
      },
      // 完成回调
      (imageId: string, result: any) => {
        const image = images.value.find(img => img.id === imageId)
        if (image) {
          image.status = 'completed'
          image.compressedSize = result.compressedSize
          image.compressedDimensions = result.dimensions
          image.compressionRatio = result.compressedSize / result.originalSize

          // 创建压缩后的图片URL
          const blob = new Blob([result.compressedData], {
            type: `image/${settings.format}`
          })
          image.compressedUrl = URL.createObjectURL(blob)
          image.compressedBlob = blob
        }
      },
      // 错误回调
      (imageId: string, error: Error) => {
        const image = images.value.find(img => img.id === imageId)
        if (image) {
          image.status = 'error'
          image.error = error.message
        }
      }
    )

    const completedCount = images.value.filter(img => img.status === 'completed').length
    ElMessage.success(`成功压缩 ${completedCount} 张图片`)
  } catch (error) {
    ElMessage.error('压缩过程中发生错误: ' + (error as Error).message)
  } finally {
    uploadRef.value?.setCompressing(false)
  }
}

const downloadAll = async () => {
  const completedImages = images.value.filter(img => img.status === 'completed')

  if (completedImages.length === 0) {
    ElMessage.warning('没有可下载的图片')
    return
  }

  const loading = ElLoading.service({
    lock: true,
    text: '正在批量下载...',
    background: 'rgba(0, 0, 0, 0.7)'
  })

  try {
    downloadService.downloadMultiple(completedImages, 'jpeg')
    ElMessage.success(`开始下载 ${completedImages.length} 个文件`)
  } catch (error) {
    ElMessage.error('下载失败: ' + (error as Error).message)
  } finally {
    loading.close()
  }
}

const downloadSingle = (image: ImageFile) => {
  try {
    downloadService.downloadSingle(image, 'jpeg')
    ElMessage.success('下载完成')
  } catch (error) {
    ElMessage.error('下载失败: ' + (error as Error).message)
  }
}

const removeImage = (id: string) => {
  const index = images.value.findIndex(img => img.id === id)
  if (index !== -1) {
    const image = images.value[index]
    // 清理URL对象
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl)
    if (image.compressedUrl) URL.revokeObjectURL(image.compressedUrl)
    images.value.splice(index, 1)
  }
}

const clearAll = () => {
  images.value.forEach(image => {
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl)
    if (image.compressedUrl) URL.revokeObjectURL(image.compressedUrl)
  })
  images.value = []
  ElMessage.info('已清空所有图片')
}

onBeforeUnmount(() => {
  // 清理资源
  images.value.forEach(image => {
    if (image.originalUrl) URL.revokeObjectURL(image.originalUrl)
    if (image.compressedUrl) URL.revokeObjectURL(image.compressedUrl)
  })
  compressionService.destroy()
})
</script>

<template>
  <div class="home-container">
    <el-container>
      <el-header class="page-header">
        <div class="header-content">
          <h1 class="page-title">
            <el-icon><Picture /></el-icon>
            图片压缩工具
          </h1>
          <p class="page-subtitle">
            支持 JPEG、PNG、WebP、AVIF 格式 | 纯本地处理，保护隐私
          </p>
        </div>
      </el-header>

      <el-main class="page-main">
        <div class="main-content">
          <ImageUpload
            ref="uploadRef"
            :images="images"
            @images-added="addImages"
            @start-compression="startCompression"
            @clear-all="clearAll"
          />

          <ImagePreview
            :images="images"
            @download-all="downloadAll"
            @download-single="downloadSingle"
            @remove-image="removeImage"
            @clear-all="clearAll"
          />
        </div>
      </el-main>

      <el-footer class="page-footer">
        <div class="footer-content">
          <p>© 2024 图片压缩工具 | 纯前端实现，数据不上传</p>
        </div>
      </el-footer>
    </el-container>
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.page-header {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 16px;
  text-align: center;
}

.page-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 0 0 8px 0;
  font-size: 32px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.page-title .el-icon {
  font-size: 36px;
}

.page-subtitle {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 400;
}

.page-main {
  padding: 32px 16px;
  background: transparent;
}

.main-content {
  max-width: 1200px;
  margin: 0 auto;
}

.page-footer {
  background: rgba(0, 0, 0, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
  text-align: center;
}

.footer-content p {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
}

@media (max-width: 768px) {
  .page-title {
    font-size: 24px;
    flex-direction: column;
    gap: 8px;
  }

  .page-title .el-icon {
    font-size: 28px;
  }

  .page-subtitle {
    font-size: 14px;
  }

  .page-main {
    padding: 20px 12px;
  }

  .header-content {
    padding: 16px 12px;
  }
}

@media (max-width: 480px) {
  .page-title {
    font-size: 20px;
  }

  .page-title .el-icon {
    font-size: 24px;
  }

  .page-subtitle {
    font-size: 12px;
  }

  .page-main {
    padding: 16px 8px;
  }
}
</style>
