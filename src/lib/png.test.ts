import { inflateSync } from 'node:zlib';
import { encodePng, pdfImageToRgba } from './png';

describe('encodePng', () => {
  it('writes a valid PNG whose pixels round-trip', async () => {
    const rgba = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 0]);
    const png = await encodePng(2, 2, rgba);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset);
    expect(view.getUint32(16)).toBe(2); // width
    expect(view.getUint32(20)).toBe(2); // height
    // IDAT follows IHDR (8 + 25 bytes).
    const len = view.getUint32(33);
    const raw = inflateSync(png.subarray(41, 41 + len));
    expect([...raw.subarray(1, 9)]).toEqual([255, 0, 0, 255, 0, 255, 0, 255]);
    expect([...raw.subarray(10, 18)]).toEqual([0, 0, 255, 255, 255, 255, 255, 0]);
  });
});

describe('pdfImageToRgba', () => {
  it('expands RGB and 1-bit images', () => {
    expect([...pdfImageToRgba({ width: 1, height: 1, kind: 2, data: new Uint8Array([1, 2, 3]) })]).toEqual([1, 2, 3, 255]);
    expect([...pdfImageToRgba({ width: 2, height: 1, kind: 1, data: new Uint8Array([0b10000000]) })]).toEqual([
      255, 255, 255, 255, 0, 0, 0, 255,
    ]);
  });
});
