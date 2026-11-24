/**
 * Minimal PNG encoder (8-bit RGBA) using the built-in CompressionStream, so it works in
 * browsers, Web Workers and Node 18+ without a canvas.
 */

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  // "deflate" in CompressionStream is the zlib format PNG needs.
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Encode RGBA pixels (width*height*4 bytes) as PNG bytes. */
export async function encodePng(width: number, height: number, rgba: Uint8Array): Promise<Uint8Array> {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** pdf.js decoded image kinds. */
const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;

/** Convert a pdf.js decoded image ({ width, height, kind, data }) to RGBA. */
export function pdfImageToRgba(img: { width: number; height: number; kind?: number; data: Uint8Array | Uint8ClampedArray }): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h * 4);
  if (img.kind === GRAYSCALE_1BPP) {
    const rowBytes = (w + 7) >> 3;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const bit = (data[y * rowBytes + (x >> 3)]! >> (7 - (x & 7))) & 1;
        const o = (y * w + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = bit ? 255 : 0;
        out[o + 3] = 255;
      }
  } else if (img.kind === RGB_24BPP) {
    for (let i = 0, j = 0; i < w * h; i++, j += 3) {
      out[i * 4] = data[j]!;
      out[i * 4 + 1] = data[j + 1]!;
      out[i * 4 + 2] = data[j + 2]!;
      out[i * 4 + 3] = 255;
    }
  } else {
    out.set(data.subarray(0, w * h * 4));
  }
  return out;
}
