import type { ImageFile, CompressionSettings } from '@/types/image'

interface CompressionTask {
  id: string
  resolve: (result: any) => void
  reject: (error: Error) => void
  onProgress?: (progress: number) => void
  onMethodInfo?: (method: string, codec?: string) => void
}

class CompressionService {
  private workers: Worker[] = []
  private tasks = new Map<string, CompressionTask>()
  private queue: Array<{ imageFile: ImageFile; settings: CompressionSettings; onProgress?: (progress: number) => void }> = []
  private isProcessing = false
  private readonly maxWorkers = navigator.hardwareConcurrency || 4

  private createWorker(): Worker {
    try {
      const worker = new Worker(
        new URL('../workers/imageCompression.ts', import.meta.url),
        { type: 'module' }
      )

      // 添加更详细的错误监听
      worker.addEventListener('error', (error) => {
        console.error('Worker error event:', error)
      })

      worker.addEventListener('messageerror', (error) => {
        console.error('Worker message error:', error)
      })

      return worker
    } catch (error) {
      console.error('Failed to create worker:', error)
      throw new Error('无法创建图片压缩工作线程')
    }
  }

  private initWorkers() {
    if (this.workers.length === 0) {
      for (let i = 0; i < this.maxWorkers; i++) {
        try {
          const worker = this.createWorker()
          worker.onmessage = this.handleWorkerMessage.bind(this)
          worker.onerror = this.handleWorkerError.bind(this)
          this.workers.push(worker)
        } catch (error) {
          console.error('Failed to create worker:', error)
        }
      }
    }
  }

  private handleWorkerMessage(event: MessageEvent) {
    const { type, id, data, progress, error, method, codec } = event.data
    const task = this.tasks.get(id)

    if (!task) return

    switch (type) {
      case 'progress':
        if (task.onProgress && typeof progress === 'number') {
          task.onProgress(progress)
        }
        break

      case 'method_info':
        if (task.onMethodInfo && method) {
          task.onMethodInfo(method, codec)
        }
        break

      case 'success':
        this.tasks.delete(id)
        task.resolve(data)
        break

      case 'error':
        this.tasks.delete(id)
        task.reject(new Error(error || '压缩失败'))
        break
    }
  }

  private handleWorkerError(error: ErrorEvent) {
    console.error('Worker error:', error)
    console.error('Error details:', {
      message: error.message,
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno,
      error: error.error
    })

    // 找到并拒绝所有待处理的任务
    this.tasks.forEach(task => {
      task.reject(new Error(`Worker执行错误: ${error.message || '未知错误'}`))
    })
    this.tasks.clear()

    // 重新初始化workers
    this.destroy()
    setTimeout(() => {
      this.initWorkers()
    }, 1000)
  }

  private async fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(file)
    })
  }

  private getAvailableWorker(): Worker | null {
    return this.workers.find(worker => {
      // 检查worker是否空闲（没有正在处理的任务）
      const busyTasks = Array.from(this.tasks.values()).filter(task =>
        this.workers.some(w => w === worker)
      )
      return busyTasks.length === 0
    }) || null
  }

  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return

    this.isProcessing = true

    while (this.queue.length > 0) {
      const availableWorker = this.getAvailableWorker()
      if (!availableWorker) {
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 100))
        continue
      }

      const queueItem = this.queue.shift()
      if (queueItem) {
        this.processImageWithWorker(queueItem.imageFile, queueItem.settings, availableWorker, queueItem.onProgress)
      }
    }

    this.isProcessing = false
  }

  private async processImageWithWorker(
    imageFile: ImageFile,
    settings: CompressionSettings,
    worker: Worker,
    onProgress?: (progress: number) => void,
    onMethodInfo?: (method: string, codec?: string) => void
  ) {
    try {
      const imageData = await this.fileToArrayBuffer(imageFile.file)

      const result = await new Promise<any>((resolve, reject) => {
        const task: CompressionTask = {
          id: imageFile.id,
          resolve,
          reject,
          onProgress,
          onMethodInfo
        }
        this.tasks.set(imageFile.id, task)

        worker.postMessage({
          type: 'compress',
          imageData,
          fileName: imageFile.file.name,
          settings,
          id: imageFile.id
        })
      })

      return result
    } catch (error) {
      this.tasks.delete(imageFile.id)
      throw error
    }
  }

  async compressImage(
    imageFile: ImageFile,
    settings: CompressionSettings,
    onProgress?: (progress: number) => void,
    onMethodInfo?: (method: string, codec?: string) => void
  ): Promise<{
    compressedData: ArrayBuffer
    originalSize: number
    compressedSize: number
    dimensions: { width: number; height: number }
  }> {
    this.initWorkers()

    const availableWorker = this.getAvailableWorker()

    if (availableWorker) {
      return this.processImageWithWorker(imageFile, settings, availableWorker, onProgress, onMethodInfo)
    } else {
      // 添加到队列
      return new Promise((resolve, reject) => {
        this.queue.push({
          imageFile,
          settings,
          onProgress: (progress) => {
            if (onProgress) onProgress(progress)
          }
        })

        // 将resolve/reject添加到任务映射中
        const task: CompressionTask = {
          id: imageFile.id,
          resolve,
          reject,
          onProgress,
          onMethodInfo
        }
        this.tasks.set(imageFile.id, task)

        this.processQueue()
      })
    }
  }

  async compressImages(
    images: ImageFile[],
    settings: CompressionSettings,
    onProgress?: (imageId: string, progress: number) => void,
    onImageComplete?: (imageId: string, result: any) => void,
    onImageError?: (imageId: string, error: Error) => void,
    onMethodInfo?: (imageId: string, method: string, codec?: string) => void
  ): Promise<void> {
    this.initWorkers()

    const promises = images.map(async (imageFile) => {
      try {
        const result = await this.compressImage(
          imageFile,
          settings,
          (progress) => {
            if (onProgress) onProgress(imageFile.id, progress)
          },
          (method, codec) => {
            if (onMethodInfo) onMethodInfo(imageFile.id, method, codec)
          }
        )

        if (onImageComplete) onImageComplete(imageFile.id, result)
        return result
      } catch (error) {
        if (onImageError) onImageError(imageFile.id, error as Error)
        throw error
      }
    })

    await Promise.allSettled(promises)
  }

  destroy() {
    this.workers.forEach(worker => worker.terminate())
    this.workers = []
    this.tasks.clear()
    this.queue = []
    this.isProcessing = false
  }
}

export const compressionService = new CompressionService()