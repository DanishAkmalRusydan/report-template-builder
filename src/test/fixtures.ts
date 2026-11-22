// Test helpers for loading the real briefs in fixtures/ (git-ignored, so tests skip if absent).
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as pdfjsLegacy from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PdfjsLike } from '../lib/extract/pdf';

export const FIXTURES = resolve(__dirname, '../../fixtures');
export const pdfjs = pdfjsLegacy as unknown as PdfjsLike;

export function fixturePath(name: string): string {
  return resolve(FIXTURES, name);
}

export function hasFixture(name: string): boolean {
  return existsSync(fixturePath(name));
}

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(fixturePath(name)));
}

export const LAB2 = 'CAI20103_Lab2.pdf';
export const A2 = 'A2.docx';
export const RUBRIC_A2 = 'RUBRIC_A2.docx';
