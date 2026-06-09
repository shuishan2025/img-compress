/**
 * img-compress CLI
 *
 * 面向「被 AI / 脚本调用」:非交互、确定性、可 `--json` 机读输出、支持 stdin/stdout。
 * 复用平台无关核心 `@/core/compress`,Node 侧注入 ImageData polyfill 与 img-ops wasm 字节。
 */

import './polyfill' // 必须最先执行
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, extname, join, dirname } from 'node:path'
import process from 'node:process'

import { compressImage, detectInputFormat } from '@/core/compress'
import type { CompressionSettings } from '@/core/types'

const OUTPUT_FORMATS = ['jpeg', 'png', 'webp', 'avif'] as const
type OutputFormat = (typeof OUTPUT_FORMATS)[number]

const EXT: Record<OutputFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif'
}

// img-ops wasm 字节(与 CLI 产物同目录,build:cli 时拷入)
const wasmBytes = readFileSync(fileURLToPath(new URL('./img_ops_bg.wasm', import.meta.url)))
const imageOpsInit = { module_or_path: wasmBytes }

interface Options {
  format?: OutputFormat
  quality: number
  maxWidth?: number
  maxHeight?: number
  outDir?: string
  json: boolean
}

interface FileResult {
  input: string
  output: string | null
  ok: boolean
  originalSize?: number
  compressedSize?: number
  savedPercent?: number
  width?: number
  height?: number
  codec?: string
  decodedVia?: 'wasm' | 'canvas'
  error?: string
}

const HELP = `img-compress — 浏览器级图片压缩,命令行版

用法:
  img-compress [选项] <输入文件...>
  cat in.jpg | img-compress --format webp > out.webp

选项:
  --format <jpeg|png|webp|avif>  输出格式(默认:与输入相同)
  --quality <1-100>              质量(默认 80;PNG 无损时忽略)
  --max-width <px>               最大宽度(等比缩放)
  --max-height <px>              最大高度(等比缩放)
  --out-dir <dir>                输出目录(默认:输入旁 <名>.min.<ext>)
  --json                         输出机读 JSON
  -h, --help                     显示帮助

说明:
  - 通配符由 shell 展开(如 *.jpg)。
  - 无输入文件且 stdin 为管道时,读 stdin、写 stdout(需 --format)。
  - 退出码:全部成功 0,任一失败 1。`

function parseArgs(argv: string[]): { options: Options; inputs: string[]; help: boolean } {
  const options: Options = { quality: 80, json: false }
  const inputs: string[] = []
  let help = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const eq = arg.indexOf('=')
    const key = arg.startsWith('--') && eq !== -1 ? arg.slice(0, eq) : arg
    const inlineVal = arg.startsWith('--') && eq !== -1 ? arg.slice(eq + 1) : undefined
    const next = () => inlineVal ?? argv[++i]

    switch (key) {
      case '-h':
      case '--help':
        help = true
        break
      case '--json':
        options.json = true
        break
      case '--format': {
        const v = next()
        if (!OUTPUT_FORMATS.includes(v as OutputFormat)) {
          throw new Error(`无效格式: ${v}(支持 ${OUTPUT_FORMATS.join('/')})`)
        }
        options.format = v as OutputFormat
        break
      }
      case '--quality':
        options.quality = Number(next())
        break
      case '--max-width':
        options.maxWidth = Number(next())
        break
      case '--max-height':
        options.maxHeight = Number(next())
        break
      case '--out-dir':
        options.outDir = next()
        break
      default:
        if (arg.startsWith('-')) throw new Error(`未知选项: ${arg}`)
        inputs.push(arg)
    }
  }

  return { options, inputs, help }
}

function resolveFormat(options: Options, bytes: Uint8Array): OutputFormat {
  if (options.format) return options.format
  const detected = detectInputFormat(bytes)
  if (detected && OUTPUT_FORMATS.includes(detected as OutputFormat)) {
    return detected as OutputFormat
  }
  throw new Error(`无法识别输入格式,请用 --format 指定`)
}

function settingsFor(format: OutputFormat, options: Options): CompressionSettings {
  return {
    format,
    quality: options.quality,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    removeMetadata: true
  }
}

function outputPath(input: string, format: OutputFormat, outDir?: string): string {
  const ext = EXT[format]
  const base = basename(input, extname(input))
  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    const out = join(outDir, `${base}.${ext}`)
    return out === input ? join(outDir, `${base}.min.${ext}`) : out
  }
  return join(dirname(input), `${base}.min.${ext}`)
}

async function compressFile(input: string, options: Options): Promise<FileResult> {
  try {
    const bytes = readFileSync(input)
    const format = resolveFormat(options, bytes)
    const result = await compressImage(bytes, settingsFor(format, options), {
      imageOpsInit,
      label: basename(input)
    })
    const output = outputPath(input, format, options.outDir)
    writeFileSync(output, result.data)
    return {
      input,
      output,
      ok: true,
      originalSize: result.originalSize,
      compressedSize: result.compressedSize,
      savedPercent: round1((1 - result.compressedSize / result.originalSize) * 100),
      width: result.dimensions.width,
      height: result.dimensions.height,
      codec: result.codec,
      decodedVia: result.decodedVia
    }
  } catch (error) {
    return { input, output: null, ok: false, error: errMsg(error) }
  }
}

async function runStdin(options: Options): Promise<number> {
  if (!options.format) {
    process.stderr.write('stdin 模式需用 --format 指定输出格式\n')
    return 1
  }
  const bytes = await readStdin()
  try {
    const result = await compressImage(bytes, settingsFor(options.format, options), { imageOpsInit })
    process.stdout.write(result.data)
    if (options.json) {
      process.stderr.write(
        JSON.stringify({
          ok: true,
          originalSize: result.originalSize,
          compressedSize: result.compressedSize,
          savedPercent: round1((1 - result.compressedSize / result.originalSize) * 100),
          width: result.dimensions.width,
          height: result.dimensions.height,
          codec: result.codec
        }) + '\n'
      )
    }
    return 0
  } catch (error) {
    process.stderr.write((options.json ? JSON.stringify({ ok: false, error: errMsg(error) }) : errMsg(error)) + '\n')
    return 1
  }
}

async function main(): Promise<number> {
  let parsed
  try {
    parsed = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(errMsg(error) + '\n')
    return 1
  }

  if (parsed.help) {
    process.stdout.write(HELP + '\n')
    return 0
  }

  // stdin 模式:无输入文件且 stdin 是管道
  if (parsed.inputs.length === 0) {
    if (!process.stdin.isTTY) return runStdin(parsed.options)
    process.stdout.write(HELP + '\n')
    return 0
  }

  const results: FileResult[] = []
  for (const input of parsed.inputs) {
    results.push(await compressFile(input, parsed.options))
  }

  if (parsed.options.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  } else {
    for (const r of results) {
      if (r.ok) {
        process.stdout.write(
          `✓ ${r.input} → ${r.output}  ${fmtBytes(r.originalSize!)} → ${fmtBytes(r.compressedSize!)} ` +
            `(-${r.savedPercent}%, ${r.codec}, ${r.width}×${r.height})\n`
        )
      } else {
        process.stderr.write(`✗ ${r.input}  ${r.error}\n`)
      }
    }
  }

  return results.some((r) => !r.ok) ? 1 : 0
}

async function readStdin(): Promise<Uint8Array> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}

main().then((code) => process.exit(code))
