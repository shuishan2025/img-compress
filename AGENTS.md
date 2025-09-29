# Repository Guidelines

## Project Structure & Module Organization
The Vite + Vue 3 app lives in `src/`. Reusable UI sits in `src/components/`, route views in `src/views/`, and shared business logic in `src/services/`. Internationalization dictionaries are managed in `src/i18n/`, while `src/workers/imageCompression.ts` hosts the WASM-backed compression pipeline; see `WASM_ARCHITECTURE.md` for deeper context. Global styles belong in `src/styles/`, static assets in `public/`, and build output in `dist/` (do not commit). Type declarations are centralized in `env.d.ts` and `src/types/`.

## Build, Test, and Development Commands
Use Node 20+ (see `package.json`). Install dependencies with `npm install`. `npm run dev` starts the hot-reloading Vite server on port 5173. `npm run build` performs type-checking via `vue-tsc` and produces the production bundle. `npm run preview` serves the compiled build for smoke tests. `npm run lint` runs ESLint in autofix mode, and `npm run format` applies Prettier to `src/`.

## Coding Style & Naming Conventions
Write TypeScript in `.ts` files and `<script setup lang="ts">` blocks. Components use `PascalCase` filenames (`ImagePreview.vue`), composables and services use `camelCase`. Follow the existing 2-space indent, single quotes, and prefer trailing commas per Prettier defaults. Keep worker-safe utilities in `src/workers/` (no DOM APIs), and store shared constants/types in `src/types/`.

## Testing Guidelines
An automated test suite has not yet been added. When introducing tests, colocate specs as `ComponentName.spec.ts` (Vitest + Vue Test Utils is expected) and gate CI with `npm run test`. Until then, perform manual checks: run `npm run dev`, compress representative JPEG/PNG batches, verify before/after previews, translation toggles, and ensure worker threads stay responsive.

## Commit & Pull Request Guidelines
Adopt Conventional Commits (`feat:`, `fix:`), mirroring history (e.g., `feat: 重构为现代化WASM图片压缩工具...`). Scope messages clearly and prefer English summaries with supplemental context if needed. PRs should outline user-facing changes, manual test steps, and linked issues. For UI or performance work, attach screenshots or compression metrics. Highlight any WASM worker or localization impacts, and document follow-up tasks before requesting review.
