import type { Heading, TemplateConfig } from '../types';

const REFERENCES_RE = /^(references?|bibliography|reference list)$/i;

/** Headings to emit, honouring the References toggle (adds or removes a final "References" H1). */
export function effectiveHeadings(config: TemplateConfig): Heading[] {
  const hs = config.headings.filter((h) => h.text.trim());
  const withoutRefs = hs.filter((h) => !REFERENCES_RE.test(h.text.trim()));
  if (!config.includeReferences) return withoutRefs;
  if (withoutRefs.length !== hs.length) return hs;
  return [...hs, { id: 'references', level: 1, text: 'References', confidence: 1, origin: 'user' }];
}
