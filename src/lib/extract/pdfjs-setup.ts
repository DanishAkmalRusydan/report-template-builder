/**
 * Browser-side pdf.js loader. Vite resolves the worker file to a hashed URL via `?url`,
 * which also works under a GitHub Pages sub-path base.
 */
import type { PdfjsLike } from './pdf';

let cached: Promise<PdfjsLike> | null = null;

export function getPdfjs(): Promise<PdfjsLike> {
  cached ??= (async () => {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib as unknown as PdfjsLike;
  })();
  return cached;
}
