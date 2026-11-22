import type { TemplateConfig } from '../types';

const slug = (s: string) =>
  s
    .replace(/\(.*?\)/g, (m) => m.slice(1, -1))
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

/** "<SubjectCode>_<Assignment>_Report_Template.docx", e.g. "CAI20103_Lab_2_Report_Template.docx". */
export function templateFileName(config: TemplateConfig): string {
  const code = slug(config.cover.subjectCode);
  // Prefer the short part of the assignment name: "Assignment 2: EIS …" → "Assignment_2"; "ASSIGNMENT (Lab 2)" → "Lab_2".
  const name = config.cover.assignmentName;
  const short =
    name.match(/\((lab\s*\d+[a-z]?)\)/i)?.[1] ??
    name.match(/\b((?:assignment|lab|project|case study|coursework|tutorial|practical)\s*\d+[a-z]?)\b/i)?.[1] ??
    name.match(/^((?:assignment|lab|project|case study|coursework)\s*\d*[a-z]?)\b/i)?.[1] ??
    name.split(/\s+/).slice(0, 4).join(' ');
  const assignment = slug(short.replace(/\b([A-Z])([A-Z]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase()));
  return [code, assignment, 'Report_Template'].filter(Boolean).join('_') + '.docx';
}
