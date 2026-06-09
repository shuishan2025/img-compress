/**
 * 构建 Node CLI:用 esbuild 把 cli + core + services 打包成单个 ESM。
 * - `@` 别名指向 src(绝对路径,避免相对解析歧义)
 * - @jsquash/* 保持 external,运行时从 node_modules 解析(自带 wasm 加载)
 * - img-ops 的 wasm 字节单独拷到产物目录,CLI 运行时读取并注入
 */
import { build } from 'esbuild'
import { cpSync, chmodSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const r = (p) => resolve(root, p)

await build({
  entryPoints: [r('cli/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: r('dist/cli/index.js'),
  alias: { '@': r('src') },
  external: ['@jsquash/*'],
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info'
})

cpSync(r('src/wasm/img-ops/img_ops_bg.wasm'), r('dist/cli/img_ops_bg.wasm'))
chmodSync(r('dist/cli/index.js'), 0o755)

console.log('CLI built → dist/cli/index.js')
