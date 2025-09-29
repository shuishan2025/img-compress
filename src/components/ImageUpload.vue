<template>
  <div class="image-upload-container">
    <el-card class="upload-card">
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

        <div class="upload-content">
          <el-icon class="upload-icon" size="48">
            <UploadFilled />
          </el-icon>
          <div class="upload-text">
            <p class="primary-text">拖拽图片到此处或点击选择</p>
            <p class="secondary-text">支持 JPEG、PNG、WebP、AVIF 格式</p>
            <p class="hint-text">支持批量上传多张图片</p>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 压缩设置 -->
    <el-card class="settings-card" v-if="images.length > 0">
      <template #header>
        <div class="card-header">
          <span>压缩设置</span>
        </div>
      </template>

      <el-form :model="settings" label-width="80px">
        <el-form-item label="输出格式">
          <el-select v-model="settings.format" style="width: 120px">
            <el-option label="JPEG" value="jpeg" />
            <el-option label="PNG" value="png" />
            <el-option label="WebP" value="webp" />
            <el-option label="AVIF" value="avif" />
          </el-select>
        </el-form-item>

        <el-form-item label="压缩质量">
          <div class="quality-control">
            <el-slider
              v-model="settings.quality"
              :min="1"
              :max="100"
              show-input
              :show-input-controls="false"
              style="flex: 1; margin-right: 16px"
            />
            <span class="quality-value">{{ settings.quality }}%</span>
          </div>
        </el-form-item>

        <el-form-item label="最大宽度">
          <el-input-number
            v-model="settings.maxWidth"
            :min="100"
            :max="8192"
            placeholder="不限制"
            style="width: 150px"
          />
          <span style="margin-left: 8px; color: #909399;">px</span>
        </el-form-item>

        <el-form-item label="最大高度">
          <el-input-number
            v-model="settings.maxHeight"
            :min="100"
            :max="8192"
            placeholder="不限制"
            style="width: 150px"
          />
          <span style="margin-left: 8px; color: #909399;">px</span>
        </el-form-item>

        <el-form-item label="移除元数据">
          <el-switch v-model="settings.removeMetadata" />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            @click="startCompression"
            :loading="isCompressing"
            :disabled="images.length === 0"
          >
            开始压缩
          </el-button>
          <el-button @click="clearAll" :disabled="isCompressing">
            清空全部
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import type { ImageFile, CompressionSettings } from '@/types/image'

const props = defineProps<{
  images: ImageFile[]
}>()

const emit = defineEmits<{
  imagesAdded: [images: ImageFile[]]
  startCompression: [settings: CompressionSettings]
  clearAll: []
}>()

const fileInput = ref<HTMLInputElement>()
const isDragover = ref(false)
const isCompressing = ref(false)

const settings = reactive<CompressionSettings>({
  quality: 90,
  maxWidth: undefined,
  maxHeight: undefined,
  format: 'jpeg',
  removeMetadata: true
})

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
      ElMessage.warning(`文件 ${file.name} 不是支持的图片格式`)
    }
    return isValidType
  })

  if (validFiles.length === 0) return

  try {
    const imageFiles = await Promise.all(
      validFiles.map(file => createImageFile(file))
    )
    emit('imagesAdded', imageFiles)
    ElMessage.success(`成功添加 ${imageFiles.length} 张图片`)
  } catch (error) {
    ElMessage.error('添加图片失败: ' + (error as Error).message)
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

const startCompression = () => {
  if (props.images.length === 0) {
    ElMessage.warning('请先添加图片')
    return
  }

  isCompressing.value = true
  emit('startCompression', { ...settings })
}

const clearAll = () => {
  emit('clearAll')
}

defineExpose({
  setCompressing: (value: boolean) => {
    isCompressing.value = value
  }
})
</script>

<style scoped>
.image-upload-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.upload-card {
  margin-bottom: 0;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  background: var(--background-white, #ffffff);
}

.upload-area {
  border: 2px dashed var(--border-color, #e2e8f0);
  border-radius: 12px;
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--background-light, #f8fafc);
  position: relative;
  overflow: hidden;
}

.upload-area:hover,
.upload-area.is-dragover {
  border-color: var(--primary-teal, #14b8a6);
  background: rgba(20, 184, 166, 0.05);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1));
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.upload-icon {
  color: var(--primary-teal, #14b8a6);
  transition: transform 0.3s ease;
}

.upload-area:hover .upload-icon {
  transform: scale(1.1);
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
}

.primary-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  margin: 0;
  letter-spacing: -0.025em;
}

.secondary-text {
  font-size: 15px;
  color: var(--text-secondary, #64748b);
  margin: 0;
  font-weight: 500;
}

.hint-text {
  font-size: 13px;
  color: var(--text-muted, #94a3b8);
  margin: 0;
  font-weight: 400;
}

.settings-card {
  margin-bottom: 0;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  background: var(--background-white, #ffffff);
}

.settings-card :deep(.el-card__header) {
  background: var(--background-light, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px 16px 0 0;
  padding: 20px 24px;
}

.settings-card :deep(.el-card__body) {
  padding: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  font-size: 16px;
}

.quality-control {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 16px;
}

.quality-value {
  min-width: 45px;
  text-align: right;
  font-weight: 600;
  color: var(--primary-teal, #14b8a6);
  font-size: 14px;
}

:deep(.el-form-item__label) {
  color: var(--text-primary, #1e293b);
  font-weight: 500;
  font-size: 14px;
}

:deep(.el-button--primary) {
  background-color: var(--primary-teal, #14b8a6);
  border-color: var(--primary-teal, #14b8a6);
  font-weight: 500;
  border-radius: 8px;
  padding: 12px 24px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-button--primary:hover) {
  background-color: var(--primary-teal-dark, #0d9488);
  border-color: var(--primary-teal-dark, #0d9488);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1));
}

:deep(.el-button) {
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

:deep(.el-slider__runway) {
  background-color: var(--border-color, #e2e8f0);
}

:deep(.el-slider__bar) {
  background-color: var(--primary-teal, #14b8a6);
}

:deep(.el-slider__button) {
  background-color: var(--primary-teal, #14b8a6);
  border: 2px solid #ffffff;
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
}

:deep(.el-select) {
  border-radius: 8px;
}

:deep(.el-input-number) {
  border-radius: 8px;
}

@media (max-width: 768px) {
  .upload-area {
    padding: 32px 20px;
  }

  .primary-text {
    font-size: 16px;
  }

  .secondary-text {
    font-size: 14px;
  }

  .hint-text {
    font-size: 12px;
  }

  .upload-icon {
    font-size: 36px !important;
  }

  .settings-card :deep(.el-card__header) {
    padding: 16px 20px;
  }

  .settings-card :deep(.el-card__body) {
    padding: 20px;
  }
}

@media (max-width: 480px) {
  .upload-area {
    padding: 24px 16px;
  }

  .primary-text {
    font-size: 15px;
  }

  .secondary-text {
    font-size: 13px;
  }

  .upload-icon {
    font-size: 32px !important;
  }
}
</style>