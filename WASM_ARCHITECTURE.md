# 🚀 WASM 图片压缩架构说明

## 📋 概述

本项目采用 **@jsquash 为主、自研 Rust→WASM 补短板** 的压缩架构:

- **解码 / 编码** 由 [`@jsquash/*`](https://github.com/jamsinclair/jSquash) 负责(Squoosh 抽出的预编译 WASM:MozJPEG / libwebp / libaom / oxipng / png)。
- **EXIF 方向校正 + 高质量缩放** 由自研 Rust→WASM 模块 `img-ops` 负责 —— 这两件事 @jsquash 不提供,旧版靠浏览器 Canvas 凑合(双线性缩放、不处理方向)。
- 仅保留一个**薄解码兜底**:当 @jsquash 无法解码某个文件时,用 `createImageBitmap` 解码并打日志;缩放与编码仍走 WASM。

## 🏗️ 压缩流水线

```
文件字节 (ArrayBuffer)
   │  ① magic-bytes 嗅探输入格式 (detectInputFormat)
   │  ② 从原始字节读 EXIF orientation (img-ops.read_orientation)
   ▼
@jsquash decode ──────────►  RGBA 像素 (ImageData)
   │  └─ 失败/无解码器 → createImageBitmap 兜底(imageOrientation:'none')+ 日志
   ▼
img-ops.transform ────────►  EXIF 方向校正 + Lanczos3 缩放(SIMD)
   │  (唯一的自研 Rust 代码)
   ▼
@jsquash encode ──────────►  压缩字节(重编码天然剥离元数据,方向已烘焙进像素)
```

整条流水线运行在 Web Worker 中(每核一个 Worker),避免阻塞 UI。

## 🔧 核心组件

### 1. `rust/img-ops/`(自研 Rust→WASM)

纯 Rust、无 C 依赖,用 `wasm-pack` 构建(`npm run build:wasm`),产物输出到 `src/wasm/img-ops/`(已 gitignore,属构建产物)。依赖 `fast_image_resize`(Lanczos3 + SIMD128)和 `kamadak-exif`。

导出函数:

| 函数 | 作用 |
|---|---|
| `read_orientation(bytes) → u8` | 从原始文件字节读 EXIF orientation(1-8),无则返回 1 |
| `oriented_dimensions(w, h, orientation) → [w, h]` | 计算「已旋转」后的尺寸(orientation 5-8 交换宽高) |
| `transform(rgba, src_w, src_h, target_w, target_h, orientation, filter) → rgba` | 方向校正 + 缩放;`target_*` 为「已旋转」坐标系 |

构建用 `.cargo/config.toml` 把 `+simd128` 仅作用于 `wasm32-unknown-unknown` 目标。

### 2. `WASMCodecLoader`(`src/services/wasmCodecLoader.ts`)

懒加载并缓存 @jsquash 的 **编码器** 与 **解码器**:

- 编码:`getCodec(format).encode(imageData, options)` —— MozJPEG / oxipng / WebP / AVIF
- 解码:`decode(format, buffer) → ImageData` —— jpeg / png / webp / avif
  - 注意 oxipng 只编码不解码,**PNG 解码用独立的 `@jsquash/png`**;PNG 输出仍用 `oxipng.optimise`

### 3. `imageOps`(`src/services/imageOps.ts`)

`img-ops` WASM 的懒加载封装(幂等 init),暴露 `transform` / `readOrientation` / `orientedDimensions`。

### 4. `SmartCompressor`(`src/services/smartCompressor.ts`)

编排上述流水线。配置:

```typescript
new SmartCompressor({
  enablePreload: true,    // 预加载常用编码器
  fallbackToCanvas: true  // 允许「薄解码兜底」(带日志)
})
```

### 5. Worker(`src/workers/imageCompression.ts`)

动态加载 `SmartCompressor`,透传文件名(供兜底日志),回传 `method` / `codec` / `decodedVia`(`wasm` | `canvas`,标识解码是否走了兜底)。

## ✅ 相比旧版的改进

| 能力 | 旧版(Canvas 凑合) | 新版 |
|---|---|---|
| 缩放质量 | 浏览器双线性,缩小发糊 | Lanczos3 + SIMD |
| EXIF 方向 | ❌ 不处理,竖拍照片会躺倒 | ✅ img-ops 校正 |
| 元数据剥离 | `removeMetadata` 形同虚设 | ✅ 重编码天然剥离 |
| 结果一致性 | WASM/Canvas 两套结果,跨浏览器不一致 | 编码恒为 WASM,一致 |

## 🧪 验证

- Rust 逻辑:`cargo test`(orientation 8 种映射 + 缩放 + EXIF 兜底)
- 运行时:`npm run build` 打包全部 wasm 资产;浏览器端到端(Playwright + 系统 Chrome)验证 JPEG/PNG/WebP/跨格式压缩与缩放,以及 GIF 触发解码兜底 + 日志
- 验收(见 `CLAUDE.md`):10 张 4000×3000 JPG,maxWidth 2000 / q80,UI 不卡、方向正确、元数据剥离、缩放清晰

## 🔮 后续

- AVIF 输出目前仍走 @jsquash(libaom);纯 Rust AVIF(ravif)因太慢暂不采用
- 可选:WebP/HEIC 方向、img-ops 体积裁剪(kamadak-exif 占大头)、多步骤间减少 RGBA 跨边界拷贝
