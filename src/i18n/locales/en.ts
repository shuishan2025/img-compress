export default {
  // Header
  title: "Free Online Image Compressor and WebP/AVIF Converter",

  // Settings Panel
  settings: {
    smartCompress: "Choose the SmartCompress level",
    learnMore: "(Learn more)",
    levels: {
      lossy: "Lossy",
      glossy: "Glossy",
      lossless: "Lossless"
    },
    resizeToMaximum: "Resize to maximum",
    width: "Width",
    height: "Height",
    keepExif: "Keep Exif",
    smallerThan: "↳ Smaller than (W/H)",
    both: "Both",
    one: "One",
    convertCmyk: "Convert CMYK to RGB",
    generateWebP: "Generate WebP",
    generateAvif: "Generate Avif",
    removeBackground: "Remove background",
    backgroundColor: "↳ Background Color",
    settingsToggle: "Settings"
  },

  // Upload Area
  upload: {
    dragText: "Drag images here or click to upload",
    infoText: "Compress JPG, GIF and PNG online. The files should have maximum 10Mb.",
    loginText: "Login",
    removeRestriction: "to remove the restriction.",
    pdfCompress: "You can also compress PDFs",
    here: "here",
    compressPdf: "."
  },

  // Messages
  messages: {
    addedImages: "Successfully added {count} images",
    noImages: "No images to compress",
    compressing: "Compressing...",
    completed: "Successfully compressed {count} images",
    compressionError: "Error during compression: {error}",
    noDownloadImages: "No images to download",
    downloading: "Batch downloading...",
    downloadStart: "Started downloading {count} files",
    downloadError: "Download failed: {error}",
    downloadComplete: "Download completed",
    clearAll: "All images cleared",
    invalidFormat: "File {name} is not a supported image format",
    addImageError: "Failed to add images: {error}",
    imageNotReady: "Image compression not completed yet"
  },

  // Image Preview
  preview: {
    imageList: "Image List",
    batchDownload: "Batch Download",
    clearAll: "Clear All",
    original: "Original",
    compressed: "Compressed",
    pending: "Pending",
    processing: "Processing...",
    compressionRatio: "Compression ratio:",
    saved: "Saved:",
    download: "Download",
    delete: "Delete",
    compressionMethod: "Compression method",
    codec: "Codec"
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
    copyright: "© 2024 Image Compressor | Client-side processing, no upload"
  }
}