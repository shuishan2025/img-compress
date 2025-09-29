<script setup lang="ts">
import { ref, reactive, onBeforeUnmount } from 'vue'
import { ElMessage, ElLoading } from 'element-plus'
import { Picture, Setting, InfoFilled } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import ImageUpload from '@/components/ImageUpload.vue'
import ImagePreview from '@/components/ImagePreview.vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { compressionService } from '@/services/compressionService'
import { downloadService } from '@/services/downloadService'
import type { ImageFile, CompressionSettings } from '@/types/image'

const { t } = useI18n()

const images = ref<ImageFile[]>([])
const uploadRef = ref<InstanceType<typeof ImageUpload>>()
const fileInput = ref<HTMLInputElement>()
const isDragover = ref(false)

// Enhanced settings based on reference design
const settings = reactive({
  compressionLevel: 'lossy',
  maxWidth: '',
  maxHeight: '',
  keepExif: false,
  resizeMode: 'both',
  convertCmyk: true,
  generateWebP: false,
  generateAvif: false,
  removeBackground: false,
  // Legacy settings for compatibility
  quality: 90,
  format: 'jpeg',
  removeMetadata: true
})

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
          image.compressionMethod = result.method
          image.codec = result.codec

          // 创建压缩后的图片URL
          const blob = new Blob([result.compressedData], {
            type: `image/${settings.format}`
          })
          image.compressedUrl = URL.createObjectURL(blob)
          image.compressedBlob = blob

          // 显示压缩方法信息
          if (result.method === 'wasm' && result.codec) {
            console.log(`${image.file.name} compressed with WASM (${result.codec})`)
          } else if (result.method === 'canvas') {
            console.log(`${image.file.name} compressed with Canvas fallback`)
          }
        }
      },
      // 错误回调
      (imageId: string, error: Error) => {
        const image = images.value.find(img => img.id === imageId)
        if (image) {
          image.status = 'error'
          image.error = error.message
        }
      },
      // 方法信息回调
      (imageId: string, method: string, codec?: string) => {
        const image = images.value.find(img => img.id === imageId)
        if (image) {
          image.compressionMethod = method as 'wasm' | 'canvas'
          image.codec = codec
          console.log(`${image.file.name}: ${method}${codec ? ` (${codec})` : ''}`)
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

// File handling methods for new layout
const generateId = () => Math.random().toString(36).substr(2, 9)

const createImageFile = async (file: File): Promise<ImageFile> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      resolve({
        id: generateId(),
        file,
        originalSize: file.size,
        originalDimensions: { width: img.width, height: img.height },
        originalUrl: url,
        status: 'pending'
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法加载图片'))
    }

    img.src = url
  })
}

const processFiles = async (files: FileList | File[]) => {
  const fileArray = Array.from(files)
  const validFiles = fileArray.filter(file => {
    const isValidType = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)
    if (!isValidType) {
      ElMessage.warning(t('messages.invalidFormat', { name: file.name }))
    }
    return isValidType
  })

  if (validFiles.length === 0) return

  try {
    const imageFiles = await Promise.all(
      validFiles.map(file => createImageFile(file))
    )
    addImages(imageFiles)
    ElMessage.success(t('messages.addedImages', { count: imageFiles.length }))

    // Auto-start compression after adding files
    const compressionSettings: CompressionSettings = {
      quality: settings.quality,
      maxWidth: settings.maxWidth ? parseInt(settings.maxWidth) : undefined,
      maxHeight: settings.maxHeight ? parseInt(settings.maxHeight) : undefined,
      format: settings.format as 'jpeg' | 'png' | 'webp' | 'avif',
      removeMetadata: !settings.keepExif
    }
    startCompression(compressionSettings)
  } catch (error) {
    ElMessage.error(t('messages.addImageError', { error: (error as Error).message }))
  }
}

const handleDrop = (e: DragEvent) => {
  e.preventDefault()
  isDragover.value = false

  if (e.dataTransfer?.files) {
    processFiles(e.dataTransfer.files)
  }
}

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement
  if (input.files) {
    processFiles(input.files)
    input.value = ''
  }
}

const triggerFileInput = () => {
  fileInput.value?.click()
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
    <!-- Language Switcher -->
    <LanguageSwitcher />

    <!-- Header Section -->
    <div class="header-section">
      <h1 class="main-title">
        {{ t('title') }}
      </h1>
    </div>

    <!-- Main Content -->
    <div class="main-section">
      <!-- Settings Panel -->
      <div class="settings-panel">
        <!-- SmartCompress Level -->
        <div class="setting-group">
          <div class="setting-header">
            <span class="setting-label">{{ t('settings.smartCompress') }}</span>
            <a href="#" class="learn-more">{{ t('settings.learnMore') }}</a>
          </div>
          <div class="compress-levels">
            <button
              class="level-button"
              :class="{ active: settings.compressionLevel === 'lossy' }"
              @click="settings.compressionLevel = 'lossy'"
            >
              {{ t('settings.levels.lossy') }}
            </button>
            <button
              class="level-button"
              :class="{ active: settings.compressionLevel === 'glossy' }"
              @click="settings.compressionLevel = 'glossy'"
            >
              {{ t('settings.levels.glossy') }}
            </button>
            <button
              class="level-button"
              :class="{ active: settings.compressionLevel === 'lossless' }"
              @click="settings.compressionLevel = 'lossless'"
            >
              {{ t('settings.levels.lossless') }}
            </button>
          </div>
        </div>

        <!-- Resize Settings -->
        <div class="settings-row">
          <div class="setting-group">
            <span class="setting-label">{{ t('settings.resizeToMaximum') }}</span>
            <div class="resize-inputs">
              <el-input
                v-model="settings.maxWidth"
                :placeholder="t('settings.width')"
                size="small"
                class="dimension-input"
              />
              <span class="dimension-separator">×</span>
              <el-input
                v-model="settings.maxHeight"
                :placeholder="t('settings.height')"
                size="small"
                class="dimension-input"
              />
            </div>
          </div>

          <div class="setting-group">
            <span class="setting-label">{{ t('settings.keepExif') }}</span>
            <el-switch v-model="settings.keepExif" />
          </div>
        </div>

        <!-- Additional Settings Row -->
        <div class="settings-row">
          <div class="setting-group">
            <span class="setting-label">{{ t('settings.smallerThan') }}</span>
            <div class="resize-mode">
              <button
                class="mode-button"
                :class="{ active: settings.resizeMode === 'both' }"
                @click="settings.resizeMode = 'both'"
              >
                {{ t('settings.both') }}
              </button>
              <button
                class="mode-button"
                :class="{ active: settings.resizeMode === 'one' }"
                @click="settings.resizeMode = 'one'"
              >
                {{ t('settings.one') }}
              </button>
            </div>
          </div>

          <div class="setting-group">
            <span class="setting-label">{{ t('settings.convertCmyk') }}</span>
            <el-switch v-model="settings.convertCmyk" />
          </div>
        </div>

        <!-- Format Generation Settings -->
        <div class="settings-row">
          <div class="setting-group">
            <span class="setting-label">{{ t('settings.generateWebP') }}</span>
            <el-switch v-model="settings.generateWebP" />
          </div>

          <div class="setting-group">
            <span class="setting-label">{{ t('settings.removeBackground') }}</span>
            <el-switch v-model="settings.removeBackground" />
          </div>
        </div>

        <div class="settings-row">
          <div class="setting-group">
            <span class="setting-label">{{ t('settings.generateAvif') }}</span>
            <el-switch v-model="settings.generateAvif" />
          </div>

          <div class="setting-group">
            <span class="setting-label">{{ t('settings.backgroundColor') }}</span>
            <button class="color-button">×</button>
          </div>
        </div>

        <!-- Settings Toggle -->
        <div class="settings-toggle">
          <button class="toggle-button">
            {{ t('settings.settingsToggle') }} <el-icon><Setting /></el-icon>
          </button>
        </div>
      </div>

      <!-- Upload Area -->
      <div class="upload-section">
        <div
          class="upload-area"
          :class="{ 'is-dragover': isDragover }"
          @drop="handleDrop"
          @dragover.prevent="isDragover = true"
          @dragleave="isDragover = false"
          @click="triggerFileInput"
        >
          <input
            ref="fileInput"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/avif"
            @change="handleFileSelect"
            style="display: none"
          />

          <div class="upload-placeholder">
            <div class="sample-image">
              <div class="sample-placeholder">
                <el-icon size="48"><Picture /></el-icon>
                <span>{{ t('upload.dragText') }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="upload-info">
          <el-icon class="info-icon"><InfoFilled /></el-icon>
          <span>
            {{ t('upload.infoText') }}
            <a href="#" class="link">{{ t('upload.loginText') }}</a> {{ t('upload.removeRestriction') }}
          </span>
          <br />
          <span>{{ t('upload.pdfCompress') }} <a href="#" class="link">{{ t('upload.here') }}</a>{{ t('upload.compressPdf') }}</span>
        </div>
      </div>
    </div>

    <!-- Image Preview Section -->
    <ImagePreview
      v-if="images.length > 0"
      :images="images"
      @download-all="downloadAll"
      @download-single="downloadSingle"
      @remove-image="removeImage"
      @clear-all="clearAll"
    />
  </div>
</template>

<style scoped>
.home-container {
  min-height: 100vh;
  background: #e8f4f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  padding: 60px 20px 40px;
}

/* Header Section */
.header-section {
  text-align: center;
  margin-bottom: 60px;
}

.main-title {
  font-size: 48px;
  font-weight: 700;
  color: #2c9db3;
  margin: 0;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

/* Main Section */
.main-section {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}

/* Settings Panel */
.settings-panel {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
}

.setting-group {
  margin-bottom: 24px;
}

.setting-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.setting-label {
  font-size: 15px;
  font-weight: 500;
  color: #333;
}

.learn-more {
  color: #2c9db3;
  text-decoration: none;
  font-size: 14px;
}

.learn-more:hover {
  text-decoration: underline;
}

/* Compression Levels */
.compress-levels {
  display: flex;
  gap: 8px;
}

.level-button {
  padding: 10px 20px;
  border: 2px solid #e0e0e0;
  background: white;
  color: #666;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.level-button.active {
  border-color: #2c9db3;
  background: #2c9db3;
  color: white;
}

/* Settings Rows */
.settings-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
  margin-bottom: 20px;
  align-items: center;
}

.resize-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.dimension-input {
  width: 80px;
}

.dimension-separator {
  color: #999;
  font-weight: 500;
}

.resize-mode {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}

.mode-button {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  background: white;
  color: #666;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.mode-button.active {
  border-color: #2c9db3;
  background: #2c9db3;
  color: white;
}

.color-button {
  width: 32px;
  height: 32px;
  border: 2px solid #ddd;
  background: white;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #999;
  margin-top: 8px;
}

/* Settings Toggle */
.settings-toggle {
  text-align: right;
  margin-top: 32px;
}

.toggle-button {
  padding: 10px 20px;
  border: none;
  background: #f5f5f5;
  color: #2c9db3;
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

/* Upload Section */
.upload-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.upload-area {
  background: white;
  border: 3px dashed #2c9db3;
  border-radius: 16px;
  min-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.upload-area:hover,
.upload-area.is-dragover {
  border-color: #1a7a8a;
  background: rgba(44, 157, 179, 0.05);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(44, 157, 179, 0.15);
}

.upload-placeholder {
  text-align: center;
}

.sample-image {
  width: 200px;
  height: 150px;
  background: #f0f0f0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.sample-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #2c9db3;
  font-weight: 500;
  height: 100%;
}

.sample-placeholder span {
  font-size: 14px;
  text-align: center;
}

/* Upload Info */
.upload-info {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.info-icon {
  color: #2c9db3;
  font-size: 16px;
  margin-top: 2px;
  flex-shrink: 0;
}

.link {
  color: #2c9db3;
  text-decoration: none;
}

.link:hover {
  text-decoration: underline;
}

/* Element Plus Overrides */
:deep(.el-switch.is-checked .el-switch__core) {
  background-color: #2c9db3 !important;
  border-color: #2c9db3 !important;
}

:deep(.el-input__wrapper) {
  border-radius: 6px !important;
  border-color: #e0e0e0 !important;
}

:deep(.el-input__wrapper:hover) {
  border-color: #2c9db3 !important;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: #2c9db3 !important;
  box-shadow: 0 0 0 2px rgba(44, 157, 179, 0.1) !important;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .main-section {
    grid-template-columns: 1fr;
    gap: 30px;
  }

  .settings-row {
    grid-template-columns: 1fr;
    gap: 20px;
  }
}

@media (max-width: 768px) {
  .home-container {
    padding: 40px 16px 30px;
  }

  .main-title {
    font-size: 36px;
  }

  .settings-panel {
    padding: 24px;
  }

  .upload-area {
    min-height: 300px;
  }

  .sample-image {
    width: 150px;
    height: 120px;
  }
}

@media (max-width: 480px) {
  .main-title {
    font-size: 28px;
    line-height: 1.2;
  }

  .compress-levels {
    flex-direction: column;
    gap: 6px;
  }

  .level-button {
    width: 100%;
  }

  .upload-area {
    min-height: 250px;
  }

  .sample-image {
    width: 120px;
    height: 100px;
  }
}
</style>
