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
import { Download, Delete, ArrowRight, Picture, Warning } from '@element-plus/icons-vue'
import type { ImageFile } from '@/types/image'

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
    ElMessage.warning('没有可下载的图片')
    return
  }
  emit('downloadAll')
}

const downloadSingle = (image: ImageFile) => {
  if (image.status !== 'completed') {
    ElMessage.warning('图片尚未压缩完成')
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
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.image-grid {
  display: grid;
  gap: 24px;
}

.image-item {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.image-item:hover {
  border-color: #409eff;
  box-shadow: 0 2px 12px 0 rgba(64, 158, 255, 0.1);
}

.image-item.is-processing {
  border-color: #e6a23c;
  background-color: #fdf6ec;
}

.image-preview {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 16px;
  background-color: #fafafa;
}

.image-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.image-label {
  font-size: 12px;
  font-weight: 500;
  color: #606266;
  text-align: center;
}

.image-wrapper {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  background-color: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
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
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 8px 6px 4px;
  transform: translateY(100%);
  transition: transform 0.3s ease;
}

.image-wrapper:hover .image-overlay {
  transform: translateY(0);
}

.image-info {
  color: white;
  font-size: 11px;
  text-align: center;
  line-height: 1.2;
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #909399;
  font-size: 12px;
  text-align: center;
  height: 100%;
}

.placeholder.processing {
  color: #e6a23c;
}

.placeholder.error {
  color: #f56c6c;
}

.placeholder .el-icon {
  font-size: 24px;
}

.divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  color: #c0c4cc;
}

.file-info {
  padding: 16px;
  border-top: 1px solid #e4e7ed;
}

.file-name {
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compression-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 12px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stat-item .label {
  color: #909399;
}

.stat-item .value {
  font-weight: 500;
}

.value.excellent {
  color: #67c23a;
}

.value.good {
  color: #409eff;
}

.value.normal {
  color: #e6a23c;
}

.value.poor {
  color: #f56c6c;
}

.value.success {
  color: #67c23a;
}

.action-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 768px) {
  .image-preview {
    grid-template-columns: 1fr;
    gap: 16px;
    text-align: center;
  }

  .divider {
    transform: rotate(90deg);
    padding: 8px 0;
  }

  .image-wrapper {
    width: 100px;
    height: 100px;
  }

  .compression-stats {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .action-buttons {
    justify-content: center;
  }

  .header-actions {
    justify-content: center;
    width: 100%;
  }
}

@media (max-width: 480px) {
  .card-header {
    flex-direction: column;
    align-items: stretch;
  }

  .header-actions {
    justify-content: stretch;
  }

  .header-actions .el-button {
    flex: 1;
  }
}
</style>