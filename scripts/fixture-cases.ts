import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const FIXTURES = join(ROOT, 'fixtures');

export interface FixtureCase {
  brief: string;
  /** Rubric .docx whose name contains the brief's name, e.g. A2.docx ↔ RUBRIC_A2.docx. */
  rubricDocx?: string;
}

/** Briefs in fixtures/ (git-ignored, so this is empty in CI). */
export function fixtureCases(): FixtureCase[] {
  if (!existsSync(FIXTURES)) return [];
  const files = readdirSync(FIXTURES);
  return files
    .filter((f) => /\.(pdf|docx)$/i.test(f) && !/rubric/i.test(f))
    .map((brief) => {
      const stem = basename(brief).replace(/\.(pdf|docx)$/i, '').toLowerCase();
      const rubric = files.find((f) => /rubric/i.test(f) && /\.docx$/i.test(f) && f.toLowerCase().includes(stem));
      return { brief, ...(rubric ? { rubricDocx: rubric } : {}) };
    });
}
