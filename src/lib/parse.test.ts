import { parseBrief, NoTextLayerError } from './parse';
import { pdfjs } from '../test/fixtures';

/** A valid one-page PDF with no text (like a scan without OCR). */
function emptyPdf(): Uint8Array {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << >> >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${off.toString().padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe('parseBrief', () => {
  it('throws a friendly error for a PDF with no text layer', async () => {
    const err = await parseBrief('scan.pdf', emptyPdf(), { pdfjs }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoTextLayerError);
    expect((err as Error).message).toBe('This PDF has no text layer. Paste the brief text instead.');
  });

  it('rejects unsupported file types', async () => {
    await expect(parseBrief('brief.txt', new Uint8Array([1, 2, 3]))).rejects.toThrow(/Upload a .docx or .pdf/);
  });
});
