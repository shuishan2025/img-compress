export default {
  // Header
  title: "免费在线图片压缩工具和WebP/AVIF转换器",

  // Settings Panel
  settings: {
    smartCompress: "选择智能压缩级别",
    learnMore: "(了解更多)",
    levels: {
      lossy: "有损压缩",
      glossy: "光泽压缩",
      lossless: "无损压缩"
    },
    resizeToMaximum: "调整到最大尺寸",
    width: "宽度",
    height: "高度",
    keepExif: "保留Exif信息",
    smallerThan: "↳ 小于 (宽/高)",
    both: "两者",
    one: "其一",
    convertCmyk: "转换CMYK到RGB",
    generateWebP: "生成WebP格式",
    generateAvif: "生成Avif格式",
    removeBackground: "移除背景",
    backgroundColor: "↳ 背景颜色",
    settingsToggle: "设置"
  },

  // Upload Area
  upload: {
    dragText: "拖拽图片到此处或点击上传",
    infoText: "在线压缩JPG、GIF和PNG格式图片。文件最大限制10MB。",
    pdfCompress: "您也可以在",
    here: "这里",
    compressPdf: "压缩PDF文件。"
  },

  // Messages
  messages: {
    addedImages: "成功添加 {count} 张图片",
    noImages: "没有待压缩的图片",
    compressing: "压缩中...",
    completed: "成功压缩 {count} 张图片",
    compressionError: "压缩过程中发生错误: {error}",
    noDownloadImages: "没有可下载的图片",
    downloading: "正在批量下载...",
    downloadStart: "开始下载 {count} 个文件",
    downloadError: "下载失败: {error}",
    downloadComplete: "下载完成",
    clearAll: "已清空所有图片",
    invalidFormat: "文件 {name} 不是支持的图片格式",
    addImageError: "添加图片失败: {error}",
    imageNotReady: "图片尚未压缩完成"
  },

  // Image Preview
  preview: {
    imageList: "图片列表",
    batchDownload: "批量下载",
    clearAll: "清空全部",
    original: "原图",
    compressed: "压缩后",
    pending: "待压缩",
    processing: "压缩中...",
    compressionRatio: "压缩率:",
    saved: "节省:",
    download: "下载",
    delete: "删除",
    compressionMethod: "压缩方法",
    codec: "编码器"
  },

  // File formats
  formats: {
    jpeg: "JPEG",
    png: "PNG",
    webp: "WebP",
    avif: "AVIF"
  },

  // Compression methods
  compressionMethods: {
    wasm: "WASM",
    canvas: "Canvas"
  },

  // Footer
  footer: {
    copyright: "© 2024 图片压缩工具 | 纯前端实现，数据不上传"
  }
}
