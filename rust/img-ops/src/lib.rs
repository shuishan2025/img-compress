//! Pixel operations that @jsquash does not provide.
//!
//! The compression pipeline is: `@jsquash decode -> img-ops::transform -> @jsquash encode`.
//! This crate owns exactly the two things @jsquash can't do:
//!   1. EXIF orientation correction (decoders return raw pixels with no orientation applied)
//!   2. High-quality Lanczos3 resize (better than the browser Canvas bilinear fallback)
//!
//! Everything operates on raw RGBA8 buffers (4 bytes per pixel, non-premultiplied alpha).

use fast_image_resize::images::Image;
use fast_image_resize::{FilterType, MulDiv, PixelType, ResizeAlg, ResizeOptions, Resizer};
use wasm_bindgen::prelude::*;

/// Resampling filter selector exposed to JS (keep in sync with the TS side).
const FILTER_LANCZOS3: u8 = 0;
const FILTER_BILINEAR: u8 = 1;

/// Read the EXIF orientation tag (1-8) from the original, undecoded file bytes.
///
/// Returns `1` (no transform) when there is no EXIF block or no orientation tag,
/// which is the correct default for PNG/WebP and metadata-less JPEGs.
#[wasm_bindgen]
pub fn read_orientation(file_bytes: &[u8]) -> u8 {
    parse_orientation(file_bytes).unwrap_or(1)
}

fn parse_orientation(file_bytes: &[u8]) -> Option<u8> {
    let mut cursor = std::io::Cursor::new(file_bytes);
    let reader = exif::Reader::new();
    let exif = reader.read_from_container(&mut cursor).ok()?;
    let field = exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)?;
    let value = field.value.get_uint(0)?;
    match value {
        1..=8 => Some(value as u8),
        _ => None,
    }
}

/// Apply EXIF orientation, then resize to the requested target dimensions.
///
/// `target_w` / `target_h` are expressed in the **oriented** coordinate space
/// (i.e. after orientations 5-8 have swapped width/height). The caller is
/// responsible for computing them against the oriented source dimensions, which
/// it can derive with [`oriented_dimensions`].
#[wasm_bindgen]
pub fn transform(
    rgba: &[u8],
    src_w: u32,
    src_h: u32,
    target_w: u32,
    target_h: u32,
    orientation: u8,
    filter: u8,
) -> Vec<u8> {
    let (oriented, ow, oh) = apply_orientation(rgba, src_w, src_h, orientation);

    if ow == target_w && oh == target_h {
        return oriented; // orientation-only, no scaling needed
    }

    resize_rgba(oriented, ow, oh, target_w, target_h, filter)
}

/// Given a source size and EXIF orientation, return the oriented (width, height).
/// Orientations 5-8 transpose the image, so width and height swap.
#[wasm_bindgen]
pub fn oriented_dimensions(src_w: u32, src_h: u32, orientation: u8) -> Vec<u32> {
    match orientation {
        5 | 6 | 7 | 8 => vec![src_h, src_w],
        _ => vec![src_w, src_h],
    }
}

fn apply_orientation(rgba: &[u8], w: u32, h: u32, orientation: u8) -> (Vec<u8>, u32, u32) {
    if orientation <= 1 || orientation > 8 {
        return (rgba.to_vec(), w, h);
    }

    let (w, h) = (w as usize, h as usize);
    let (nw, nh): (usize, usize) = match orientation {
        5 | 6 | 7 | 8 => (h, w),
        _ => (w, h),
    };

    let mut out = vec![0u8; nw * nh * 4];
    for y in 0..h {
        for x in 0..w {
            // Forward map: where does source pixel (x, y) land in the corrected image?
            let (nx, ny) = match orientation {
                2 => (w - 1 - x, y),         // mirror horizontal
                3 => (w - 1 - x, h - 1 - y), // rotate 180
                4 => (x, h - 1 - y),         // mirror vertical
                5 => (y, x),                 // transpose
                6 => (h - 1 - y, x),         // rotate 90 CW
                7 => (h - 1 - y, w - 1 - x), // transverse
                8 => (y, w - 1 - x),         // rotate 90 CCW
                _ => (x, y),
            };
            let si = (y * w + x) * 4;
            let di = (ny * nw + nx) * 4;
            out[di..di + 4].copy_from_slice(&rgba[si..si + 4]);
        }
    }
    (out, nw as u32, nh as u32)
}

fn resize_rgba(
    rgba: Vec<u8>,
    src_w: u32,
    src_h: u32,
    dst_w: u32,
    dst_h: u32,
    filter: u8,
) -> Vec<u8> {
    let mut src = Image::from_vec_u8(src_w, src_h, rgba, PixelType::U8x4)
        .expect("source RGBA buffer size must match dimensions");
    let mut dst = Image::new(dst_w, dst_h, PixelType::U8x4);

    // Resize in premultiplied-alpha space so edges of transparent regions don't bleed.
    let mul_div = MulDiv::default();
    let _ = mul_div.multiply_alpha_inplace(&mut src);

    let alg = match filter {
        FILTER_BILINEAR => ResizeAlg::Convolution(FilterType::Bilinear),
        FILTER_LANCZOS3 | _ => ResizeAlg::Convolution(FilterType::Lanczos3),
    };
    let opts = ResizeOptions::new().resize_alg(alg);

    let mut resizer = Resizer::new();
    resizer
        .resize(&src, &mut dst, &opts)
        .expect("resize should not fail for valid U8x4 images");

    let _ = mul_div.divide_alpha_inplace(&mut dst);
    dst.into_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    // 2x1 image: pixel (0,0) red, pixel (1,0) green.
    fn sample_2x1() -> Vec<u8> {
        vec![255, 0, 0, 255, /* */ 0, 255, 0, 255]
    }

    #[test]
    fn orientation_1_is_identity() {
        let (out, w, h) = apply_orientation(&sample_2x1(), 2, 1, 1);
        assert_eq!((w, h), (2, 1));
        assert_eq!(out, sample_2x1());
    }

    #[test]
    fn orientation_2_mirrors_horizontally() {
        let (out, w, h) = apply_orientation(&sample_2x1(), 2, 1, 2);
        assert_eq!((w, h), (2, 1));
        // red and green swap positions
        assert_eq!(&out[0..4], &[0, 255, 0, 255]);
        assert_eq!(&out[4..8], &[255, 0, 0, 255]);
    }

    #[test]
    fn orientation_6_swaps_dimensions() {
        // rotate 90 CW: 2x1 becomes 1x2
        let (_out, w, h) = apply_orientation(&sample_2x1(), 2, 1, 6);
        assert_eq!((w, h), (1, 2));
    }

    #[test]
    fn oriented_dimensions_swap_for_5_to_8() {
        assert_eq!(oriented_dimensions(100, 50, 1), vec![100, 50]);
        assert_eq!(oriented_dimensions(100, 50, 6), vec![50, 100]);
    }

    #[test]
    fn transform_downscales_solid_image() {
        // 4x4 solid blue, downscale to 2x2 -> still blue everywhere.
        let src: Vec<u8> = std::iter::repeat([0u8, 0, 255, 255])
            .take(16)
            .flatten()
            .collect();
        let out = transform(&src, 4, 4, 2, 2, 1, FILTER_LANCZOS3);
        assert_eq!(out.len(), 2 * 2 * 4);
        for px in out.chunks(4) {
            assert_eq!(px[2], 255); // blue channel preserved
            assert_eq!(px[3], 255); // opaque
        }
    }

    #[test]
    fn read_orientation_defaults_to_1_on_garbage() {
        assert_eq!(read_orientation(&[0, 1, 2, 3, 4]), 1);
    }
}
