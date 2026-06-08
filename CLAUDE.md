# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A client-side image compression tool built with Vue 3 + TypeScript. Compresses JPEG, PNG, WebP, and AVIF images entirely in the browser. Decode/encode use `@jsquash/*` WASM codecs; a self-built Rust→WASM module (`img-ops`) handles EXIF orientation and high-quality Lanczos3 resize. Batch processing runs in Web Workers to keep the UI responsive.

## Commands

### Development
- `npm run dev` - Start development server with Vite
- `npm run preview` - Preview production build

### Build & Quality
- `npm run build` - Type check and build for production
- `npm run build:wasm` - Recompile `rust/img-ops` to WASM (run manually after editing Rust; commit the result)
- `npm run build-only` - Build without type checking
- `npm run type-check` - Run Vue TSC type checking
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier

### Toolchain
- Node.js `^20.19.0 || >=22.12.0`
- The compiled WASM artifact `src/wasm/img-ops/` **is committed to the repo**, so `npm install && npm run build` works without Rust (deploy envs do NOT need a Rust toolchain).
- Editing the Rust crate requires Rust + `wasm-pack` + the `wasm32-unknown-unknown` target; run `npm run build:wasm` and commit the regenerated artifact.

## Architecture

### Core Compression Pipeline

Runs per image inside a Web Worker:

```
file bytes → detect format (magic bytes) → read EXIF orientation (img-ops)
          → @jsquash decode → ImageData (RGBA)
          → img-ops.transform (EXIF orient + Lanczos3 resize)
          → @jsquash encode → compressed bytes (metadata stripped by re-encode)
```

- **@jsquash owns decode + encode** (MozJPEG / oxipng / WebP / AVIF). PNG decode uses `@jsquash/png` (oxipng only encodes); PNG output still uses `oxipng.optimise`.
- **`img-ops` (Rust→WASM) owns** EXIF orientation correction and Lanczos3 resize — the two things @jsquash doesn't provide.
- **Thin decode-only Canvas fallback**: if @jsquash can't decode a file (unknown format / decode throws), `createImageBitmap(blob, { imageOrientation: 'none' })` decodes it AND a `[img-compress] 降级到 Canvas 解码` warning is logged. Resize + encode still run in WASM. `decodedVia` (`wasm`/`canvas`) is reported on the result.

### Key Services

**`rust/img-ops/`** - Self-built Rust→WASM module (pure Rust, no C deps)
- `transform(rgba, src_w, src_h, target_w, target_h, orientation, filter)` - orient + resize; target dims are in oriented space
- `read_orientation(bytes)` / `oriented_dimensions(w, h, orientation)`
- Built with `npm run build:wasm`; SIMD128 scoped to wasm target in `.cargo/config.toml`

**`src/services/imageOps.ts`** - Lazy, idempotent wrapper around the `img-ops` WASM module

**`src/services/smartCompressor.ts`** - Main compression orchestrator
- `compress(imageData, settings, onProgress?, fileName?)` runs the pipeline above
- `detectInputFormat()` sniffs input format from magic bytes
- Returns `CompressionResult` with `method` (always `wasm` for encode), `codec`, and `decodedVia`

**`src/services/wasmCodecLoader.ts`** - Dynamic `@jsquash/*` loader (encode + decode)
- `getCodec(format)` / `decode(format, buffer)` - lazy-load + cache codecs and decoders
- `preloadCommonCodecs()` eagerly loads JPEG and WebP for better UX

**`src/workers/imageCompression.ts`** - Web Worker for background processing
- Imports `SmartCompressor` dynamically in worker context
- Communicates progress updates via `postMessage()`
- Prevents main thread blocking during compression

**`src/services/compressionService.ts`** - High-level batch coordination
- Manages multiple image compressions via worker pool
- Handles worker lifecycle and message passing
- Tracks per-image progress and status

### Internationalization (i18n)

- Uses `vue-i18n` v9 with Composition API
- Locale files: `src/i18n/locales/{zh,en}.ts`
- Auto-detects browser language, falls back to Chinese
- Language preference stored in `localStorage`

### Build Configuration

**`vite.config.ts` critical settings:**
- `optimizeDeps.exclude` - Excludes WASM packages from pre-bundling (required for dynamic import)
- `server.headers` - Sets COOP/COEP headers (required for `SharedArrayBuffer` in WASM)
- `worker.format: 'es'` - Uses ES modules in Web Workers
- `build.rollupOptions.manualChunks` - Separates WASM codecs into dedicated chunk for code splitting

## Development Notes

### Testing Compression
To validate the acceptance criteria:
1. Upload 10 JPGs at 4000×3000px
2. Set max dimension to 2000px, quality to 80%
3. Verify UI remains responsive (worker-based processing)
4. Check original/compressed size and compression ratio display

### WASM Codec Updates
When updating `@jsquash/*` packages:
1. Update encode configs (`CODEC_CONFIGS`) and `DECODER_LOADERS` in `src/services/wasmCodecLoader.ts`
2. Verify type imports from `/meta.js` still exist
3. Test the decode fallback by feeding a format @jsquash can't decode (e.g. a GIF) and confirming `decodedVia: 'canvas'` + the warning log

### Editing the Rust module (`img-ops`)
1. Edit `rust/img-ops/src/lib.rs`; keep `cargo test` (native unit tests) green
2. Rebuild with `npm run build:wasm`; the filter constants in `imageOps.ts` must stay in sync with `lib.rs`
3. `target_*` args to `transform` are in **oriented** coordinate space (after orientation 5-8 swaps width/height)

### Adding New Image Formats
1. Add an encode config to `CODEC_CONFIGS` and (if it's an input format) a decoder to `DECODER_LOADERS` in `wasmCodecLoader.ts`
2. Update `CompressionSettings.format` type in `src/types/image.ts`
3. Add a magic-bytes branch to `detectInputFormat()` in `smartCompressor.ts`
4. Update i18n locale files with the format display name