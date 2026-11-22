import JSZip from 'jszip';

export interface RubricInfo {
  landscape: boolean;
  /** Page count Word saved in docProps/app.xml (0 when unknown). */
  pages: number;
  /** First line of text, for the preview thumbnail. */
  title?: string;
  /** First table rows (cell text) for the preview thumbnail. */
  sample: string[][];
}

/** Read orientation, page count and a little text from a rubric .docx (no rendering). */
export async function inspectRubricDocx(data: ArrayBuffer | Uint8Array): Promise<RubricInfo> {
  const zip = await JSZip.loadAsync(data);
  const doc = await zip.file('word/document.xml')?.async('string');
  if (!doc) throw new Error('This rubric file is not a valid Word document.');
  const app = (await zip.file('docProps/app.xml')?.async('string')) ?? '';
  const lastSect = doc.slice(doc.lastIndexOf('<w:sectPr'));
  const w = Number(lastSect.match(/<w:pgSz[^>]*w:w="(\d+)"/)?.[1] ?? 0);
  const h = Number(lastSect.match(/<w:pgSz[^>]*w:h="(\d+)"/)?.[1] ?? 0);
  const landscape = /w:orient="landscape"/.test(lastSect) || w > h;
  const text = (xml: string) =>
    [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join('')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  const firstPara = doc.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)?.map(text).find(Boolean);
  const sample: string[][] = [];
  const table = doc.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)?.[sample.length ? 0 : 0];
  for (const row of (table ?? '').match(/<w:tr\b[\s\S]*?<\/w:tr>/g)?.slice(0, 6) ?? []) {
    sample.push((row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) ?? []).map(text));
  }
  return {
    landscape,
    pages: Number(app.match(/<Pages>(\d+)<\/Pages>/)?.[1] ?? 0),
    ...(firstPara ? { title: firstPara } : {}),
    sample,
  };
}
