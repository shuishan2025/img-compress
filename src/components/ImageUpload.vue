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
  gap: 20px;
}

.upload-card {
  margin-bottom: 0;
}

.upload-area {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s ease;
  background-color: #fafafa;
}

.upload-area:hover,
.upload-area.is-dragover {
  border-color: #409eff;
  background-color: #f0f9ff;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.upload-icon {
  color: #409eff;
}

.upload-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.primary-text {
  font-size: 16px;
  font-weight: 500;
  color: #303133;
  margin: 0;
}

.secondary-text {
  font-size: 14px;
  color: #606266;
  margin: 0;
}

.hint-text {
  font-size: 12px;
  color: #909399;
  margin: 0;
}

.settings-card {
  margin-bottom: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quality-control {
  display: flex;
  align-items: center;
  width: 100%;
}

.quality-value {
  min-width: 40px;
  text-align: right;
  font-weight: 500;
  color: #409eff;
}

@media (max-width: 768px) {
  .upload-area {
    padding: 20px;
  }

  .primary-text {
    font-size: 14px;
  }

  .secondary-text {
    font-size: 12px;
  }

  .upload-icon {
    font-size: 36px !important;
  }
}
</style>