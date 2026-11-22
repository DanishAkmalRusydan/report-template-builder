/**
 * Render PDF pages to PNG for visual checks.
 * Usage: npx vite-node scripts/render-pdf.ts <file.pdf> <outDir> [pages e.g. 1-3,9] [scale]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const [file, outDir = 'out/png', pagesArg, scaleArg] = process.argv.slice(2);
if (!file) throw new Error('Usage: render-pdf.ts <file.pdf> <outDir> [pages] [scale]');

function parsePages(spec: string | undefined, n: number): number[] {
  if (!spec) return Array.from({ length: n }, (_, i) => i + 1);
  return spec.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? Array.from({ length: b - a! + 1 }, (_, i) => a! + i) : [a!];
  });
}

const canvasFactory = {
  create: (w: number, h: number) => {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext('2d') };
  },
  reset: (cc: { canvas: { width: number; height: number } }, w: number, h: number) => {
    cc.canvas.width = w;
    cc.canvas.height = h;
  },
  destroy: () => {},
};

mkdirSync(outDir, { recursive: true });
const pdfjsRoot = join(process.cwd(), 'node_modules', 'pdfjs-dist');
const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(file)),
  verbosity: 0,
  disableFontFace: true,
  useSystemFonts: false,
  standardFontDataUrl: `${join(pdfjsRoot, 'standard_fonts')}/`,
  cMapUrl: `${join(pdfjsRoot, 'cmaps')}/`,
  cMapPacked: true,
}).promise;
const scale = Number(scaleArg ?? 0.6);
for (const n of parsePages(pagesArg, doc.numPages)) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale });
  const { canvas, context } = canvasFactory.create(Math.ceil(vp.width), Math.ceil(vp.height));
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const params = { canvasContext: context, viewport: vp, canvasFactory } as unknown as Parameters<typeof page.render>[0];
  await page.render(params).promise;
  const out = join(outDir, `${basename(file, '.pdf')}-p${n}.png`);
  writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(out);
}
