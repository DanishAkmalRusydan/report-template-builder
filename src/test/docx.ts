import JSZip from 'jszip';
import { XMLValidator } from 'fast-xml-parser';
import type { Heading, TemplateConfig } from '../lib/types';

export interface DocxParts {
  zip: JSZip;
  names: string[];
  dirEntries: string[];
  text: (name: string) => Promise<string>;
}

export async function openDocx(bytes: Uint8Array): Promise<DocxParts> {
  const zip = await JSZip.loadAsync(bytes);
  return {
    zip,
    names: Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name),
    dirEntries: Object.values(zip.files).filter((f) => f.dir).map((f) => f.name),
    text: async (name) => {
      const f = zip.file(name);
      if (!f) throw new Error(`missing part ${name}`);
      return f.async('string');
    },
  };
}

/** Names of XML parts that are not well-formed. */
export async function malformedParts(p: DocxParts): Promise<string[]> {
  const bad: string[] = [];
  for (const n of p.names.filter((x) => /\.(xml|rels)$/.test(x))) {
    if (XMLValidator.validate(await p.text(n)) !== true) bad.push(n);
  }
  return bad;
}

const h = (text: string, level: 1 | 2 = 1): Heading => ({ id: text, level, text, confidence: 1, origin: 'user' });

export function sampleConfig(over: Partial<TemplateConfig> = {}): TemplateConfig {
  return {
    id: 'tpl_test',
    createdAt: '2026-11-22T00:00:00.000Z',
    headings: [h('Part A: Introduction'), h('Task A1: Background', 2), h('Part B: Method'), h('Part C: Results')],
    format: { font: 'Arial', fontSizePt: 11, lineSpacing: 1.5, justified: true, paper: 'A4', pageNumber: 'bottom-right' },
    cover: {
      mode: 'generated',
      universityName: 'Sample University',
      subjectCode: 'ABC12345',
      subjectName: 'SAMPLE SUBJECT',
      assignmentName: 'Assignment 1',
      assignmentTitle: 'A Sample Title',
      lecturer: 'Dr. Example',
      memberRows: 2,
      showPictureColumn: true,
      briefFields: [],
    },
    onePartPerPage: true,
    includeReferences: true,
    rubric: { kind: 'none' },
    ...over,
  };
}
