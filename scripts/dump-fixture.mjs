// Debug helper: print the raw text of a fixture so detection rules can be tuned.
// Usage: node scripts/dump-fixture.mjs fixtures/A2.docx
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const file = process.argv[2];
const buf = await readFile(file);
if (file.endsWith('.docx')) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  for (const p of paras) {
    const t = (p.match(/<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>/g) ?? [])
      .map((x) => (x.startsWith('<w:tab') ? ' ' : x.replace(/<[^>]+>/g, '')))
      .join('');
    const bold = /<w:b\/>|<w:b w:val="(1|true)"\/>/.test(p) ? 'B ' : '  ';
    const style = (p.match(/<w:pStyle w:val="([^"]+)"/) ?? [])[1] ?? '';
    if (t.trim()) console.log(bold + (style ? `[${style}] ` : '') + t);
  }
} else {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    console.log(`\n===== PAGE ${i} (${Math.round(vp.width)}x${Math.round(vp.height)}) =====`);
    const tc = await page.getTextContent();
    const lines = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = it.transform[5];
      let l = lines.find((l) => Math.abs(l.y - y) < 2);
      if (!l) lines.push((l = { y, items: [] }));
      l.items.push({ x: it.transform[4], s: it.str, f: it.fontName });
    }
    lines.sort((a, b) => b.y - a.y);
    for (const l of lines) {
      l.items.sort((a, b) => a.x - b.x);
      console.log(`${Math.round(l.items[0].x).toString().padStart(4)} | ` + l.items.map((i) => i.s).join(' '));
    }
  }
}
