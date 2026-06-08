/* tslint:disable */
/* eslint-disable */

/**
 * Given a source size and EXIF orientation, return the oriented (width, height).
 * Orientations 5-8 transpose the image, so width and height swap.
 */
export function oriented_dimensions(src_w: number, src_h: number, orientation: number): Uint32Array;

/**
 * Read the EXIF orientation tag (1-8) from the original, undecoded file bytes.
 *
 * Returns `1` (no transform) when there is no EXIF block or no orientation tag,
 * which is the correct default for PNG/WebP and metadata-less JPEGs.
 */
export function read_orientation(file_bytes: Uint8Array): number;

/**
 * Apply EXIF orientation, then resize to the requested target dimensions.
 *
 * `target_w` / `target_h` are expressed in the **oriented** coordinate space
 * (i.e. after orientations 5-8 have swapped width/height). The caller is
 * responsible for computing them against the oriented source dimensions, which
 * it can derive with [`oriented_dimensions`].
 */
export function transform(rgba: Uint8Array, src_w: number, src_h: number, target_w: number, target_h: number, orientation: number, filter: number): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly oriented_dimensions: (a: number, b: number, c: number) => [number, number];
    readonly read_orientation: (a: number, b: number) => number;
    readonly transform: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
