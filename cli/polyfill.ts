/**
 * Node 环境 polyfill
 *
 * 两件事,必须在任何编码/解码发生前(本模块被最先 import)执行:
 *
 * 1. file: 协议的 fetch shim —— @jsquash 各 codec(无论 emscripten 还是
 *    wasm-bindgen)都用 `fetch(new URL('xxx.wasm', import.meta.url))` 加载 wasm,
 *    而 Node 的 fetch 不支持 file: URL,会 "fetch failed"。这里补上。
 *
 * 2. ImageData 全局类 —— oxipng 的 `optimise` 用 `data instanceof ImageData`
 *    区分入参。本类既被 `new ImageData(...)` 构造,也用于 `instanceof` 判断,
 *    同一个类,保证判断成立。
 */

// --- 0. 输出纪律:stdout 只放数据/JSON ---
// codec 加载等 console.log 噪声会污染 stdout(破坏 --json 和 stdin→stdout 的二进制)。
// 把 log/info/debug 转到 stderr;warn/error 本就在 stderr。
console.log = console.info = console.debug = (...args: unknown[]) => console.error(...args)

// --- 1. file: fetch shim ---
const realFetch = globalThis.fetch?.bind(globalThis)
globalThis.fetch = (async (input: unknown, init?: unknown) => {
  const href =
    input instanceof URL
      ? input.href
      : typeof input === 'string'
        ? input
        : ((input as { url?: string })?.url ?? String(input))
  if (href.startsWith('file:')) {
    const { readFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    const buf = await readFile(fileURLToPath(href))
    return new Response(buf, { headers: { 'content-type': 'application/wasm' } })
  }
  if (!realFetch) throw new Error(`fetch 不可用: ${href}`)
  return realFetch(input as RequestInfo, init as RequestInit)
}) as typeof fetch

// --- 2. ImageData ---

class NodeImageData {
  readonly data: Uint8ClampedArray
  readonly width: number
  readonly height: number
  readonly colorSpace = 'srgb'

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      // new ImageData(width, height)
      this.width = dataOrWidth
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
    } else {
      // new ImageData(data, width, height?)
      this.data = dataOrWidth
      this.width = widthOrHeight
      this.height = height ?? dataOrWidth.length / 4 / widthOrHeight
    }
  }
}

const g = globalThis as { ImageData?: unknown }
if (typeof g.ImageData === 'undefined') {
  g.ImageData = NodeImageData
}
