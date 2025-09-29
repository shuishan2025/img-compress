<template>
  <div class="image-preview-container" v-if="images.length > 0">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>图片列表 ({{ images.length }})</span>
          <div class="header-actions">
            <el-button
              size="small"
              @click="downloadAll"
              :disabled="!hasCompletedImages"
              type="primary"
            >
              <el-icon><Download /></el-icon>
              批量下载
            </el-button>
            <el-button
              size="small"
              @click="$emit('clearAll')"
              type="danger"
              plain
            >
              <el-icon><Delete /></el-icon>
              清空全部
            </el-button>
          </div>
        </div>
      </template>

      <div class="image-grid">
        <div
          v-for="image in images"
          :key="image.id"
          class="image-item"
          :class="{ 'is-processing': image.status === 'processing' }"
        >
          <!-- 图片预览 -->
          <div class="image-preview">
            <div class="image-side original">
              <div class="image-label">原图</div>
              <div class="image-wrapper">
                <img :src="image.originalUrl" :alt="image.file.name" />
                <div class="image-overlay">
                  <div class="image-info">
                    <div>{{ formatFileSize(image.originalSize) }}</div>
                    <div>{{ image.originalDimensions.width }}×{{ image.originalDimensions.height }}</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="divider">
              <el-icon><ArrowRight /></el-icon>
            </div>

            <div class="image-side compressed">
              <div class="image-label">压缩后</div>
              <div class="image-wrapper">
                <div v-if="image.status === 'pending'" class="placeholder">
                  <el-icon><Picture /></el-icon>
                  <span>待压缩</span>
                </div>
                <div v-else-if="image.status === 'processing'" class="placeholder processing">
                  <el-progress
                    type="circle"
                    :percentage="image.progress || 0"
                    :width="60"
                  />
                  <span>压缩中...</span>
                </div>
                <div v-else-if="image.status === 'error'" class="placeholder error">
                  <el-icon><Warning /></el-icon>
                  <span>{{ image.error || '压缩失败' }}</span>
                </div>
                <template v-else-if="image.status === 'completed' && image.compressedUrl">
                  <img :src="image.compressedUrl" :alt="`${image.file.name} (压缩后)`" />
                  <div class="image-overlay">
                    <div class="image-info">
                      <div>{{ formatFileSize(image.compressedSize || 0) }}</div>
                      <div>{{ image.compressedDimensions?.width }}×{{ image.compressedDimensions?.height }}</div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- 文件信息 -->
          <div class="file-info">
            <div class="file-name" :title="image.file.name">
              {{ image.file.name }}
            </div>

            <div class="compression-stats" v-if="image.status === 'completed'">
              <div class="stat-item">
                <span class="label">压缩率:</span>
                <span class="value" :class="getCompressionRatioClass(image.compressionRatio)">
                  {{ formatCompressionRatio(image.compressionRatio) }}
                </span>
              </div>
              <div class="stat-item">
                <span class="label">节省:</span>
                <span class="value success">
                  {{ formatFileSize((image.originalSize - (image.compressedSize || 0))) }}
                </span>
              </div>
            </div>

            <div class="action-buttons" v-if="image.status === 'completed'">
              <el-button size="small" @click="downloadSingle(image)" type="primary" plain>
                <el-icon><Download /></el-icon>
                下载
              </el-button>
              <el-button size="small" @click="removeImage(image.id)" type="danger" plain>
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { Download, Delete, ArrowRight, Picture, Warning } from '@element-plus/icons-vue'
import type { ImageFile } from '@/types/image'

const { t } = useI18n()

const props = defineProps<{
  images: ImageFile[]
}>()

const emit = defineEmits<{
  clearAll: []
  downloadAll: []
  downloadSingle: [image: ImageFile]
  removeImage: [id: string]
}>()

const hasCompletedImages = computed(() =>
  props.images.some(image => image.status === 'completed')
)

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

const formatCompressionRatio = (ratio?: number): string => {
  if (ratio === undefined) return '--'
  return `${(ratio * 100).toFixed(1)}%`
}

const getCompressionRatioClass = (ratio?: number): string => {
  if (ratio === undefined) return ''
  if (ratio < 0.5) return 'excellent'
  if (ratio < 0.7) return 'good'
  if (ratio < 0.9) return 'normal'
  return 'poor'
}

const downloadAll = () => {
  const completedImages = props.images.filter(image => image.status === 'completed')
  if (completedImages.length === 0) {
    ElMessage.warning(t('messages.noDownloadImages'))
    return
  }
  emit('downloadAll')
}

const downloadSingle = (image: ImageFile) => {
  if (image.status !== 'completed') {
    ElMessage.warning(t('messages.imageNotReady'))
    return
  }
  emit('downloadSingle', image)
}

const removeImage = (id: string) => {
  emit('removeImage', id)
}
</script>

<style scoped>
.image-preview-container {
  margin-top: 0;
}

.image-preview-container :deep(.el-card) {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  background: var(--background-white, #ffffff);
}

.image-preview-container :deep(.el-card__header) {
  background: var(--background-light, #f8fafc);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px 16px 0 0;
  padding: 20px 24px;
}

.image-preview-container :deep(.el-card__body) {
  padding: 24px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  font-size: 16px;
}

.header-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.header-actions :deep(.el-button--primary) {
  background-color: var(--primary-teal, #14b8a6);
  border-color: var(--primary-teal, #14b8a6);
  font-weight: 500;
  border-radius: 8px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.header-actions :deep(.el-button--primary:hover) {
  background-color: var(--primary-teal-dark, #0d9488);
  border-color: var(--primary-teal-dark, #0d9488);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1));
}

.header-actions :deep(.el-button) {
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.image-grid {
  display: grid;
  gap: 24px;
}

.image-item {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background: var(--background-white, #ffffff);
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
}

.image-item:hover {
  border-color: var(--primary-teal, #14b8a6);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1));
  transform: translateY(-2px);
}

.image-item.is-processing {
  border-color: #f59e0b;
  background-color: #fffbeb;
}

.image-preview {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 20px;
  background: var(--background-light, #f8fafc);
}

.image-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.image-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary, #64748b);
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.image-wrapper {
  position: relative;
  width: 140px;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--background-white, #ffffff);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm, 0 1px 2px 0 rgb(0 0 0 / 0.05));
  border: 1px solid var(--border-color, #e2e8f0);
}

.image-wrapper img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 12px 8px 6px;
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.image-wrapper:hover .image-overlay {
  transform: translateY(0);
}

.image-info {
  color: white;
  font-size: 11px;
  text-align: center;
  line-height: 1.3;
  font-weight: 500;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted, #94a3b8);
  font-size: 13px;
  text-align: center;
  height: 100%;
  font-weight: 500;
}

.placeholder.processing {
  color: #f59e0b;
}

.placeholder.error {
  color: #ef4444;
}

.placeholder .el-icon {
  font-size: 28px;
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 20px;
  color: var(--primary-teal, #14b8a6);
  font-size: 20px;
}

.file-info {
  padding: 20px 24px;
  border-top: 1px solid var(--border-color, #e2e8f0);
  background: var(--background-white, #ffffff);
}

.file-name {
  font-weight: 600;
  color: var(--text-primary, #1e293b);
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
}

.compression-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
  font-size: 13px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--background-light, #f8fafc);
  border-radius: 8px;
  border: 1px solid var(--border-color, #e2e8f0);
}

.stat-item .label {
  color: var(--text-secondary, #64748b);
  font-weight: 500;
}

.stat-item .value {
  font-weight: 600;
}

.value.excellent {
  color: #10b981;
}

.value.good {
  color: var(--primary-teal, #14b8a6);
}

.value.normal {
  color: #f59e0b;
}

.value.poor {
  color: #ef4444;
}

.value.success {
  color: #10b981;
}

.action-buttons {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.action-buttons :deep(.el-button) {
  border-radius: 8px;
  font-weight: 500;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.action-buttons :deep(.el-button--primary) {
  background-color: transparent;
  border-color: var(--primary-teal, #14b8a6);
  color: var(--primary-teal, #14b8a6);
}

.action-buttons :deep(.el-button--primary:hover) {
  background-color: var(--primary-teal, #14b8a6);
  color: white;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1));
}

@media (max-width: 768px) {
  .image-preview {
    grid-template-columns: 1fr;
    gap: 20px;
    text-align: center;
    padding: 16px;
  }

  .divider {
    transform: rotate(90deg);
    padding: 12px 0;
  }

  .image-wrapper {
    width: 120px;
    height: 120px;
  }

  .compression-stats {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .action-buttons {
    justify-content: center;
  }

  .header-actions {
    justify-content: center;
    width: 100%;
  }

  .file-info {
    padding: 16px 20px;
  }

  .image-preview-container :deep(.el-card__header) {
    padding: 16px 20px;
  }

  .image-preview-container :deep(.el-card__body) {
    padding: 20px;
  }
}

@media (max-width: 480px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .header-actions {
    justify-content: stretch;
  }

  .header-actions .el-button {
    flex: 1;
  }

  .image-wrapper {
    width: 100px;
    height: 100px;
  }

  .action-buttons {
    flex-direction: column;
  }

  .action-buttons .el-button {
    width: 100%;
  }
}
</style>