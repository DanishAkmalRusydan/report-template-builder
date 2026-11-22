import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const REFS = /^(references?|bibliography|reference list)$/i;

/** Main parts (H1) and sub-tasks (H2), not counting a References heading. */
export function countHeadings(hs: { level: 1 | 2; text: string }[]): { parts: number; subs: number } {
  return {
    parts: hs.filter((h) => h.level === 1 && !REFS.test(h.text.trim())).length,
    subs: hs.filter((h) => h.level === 2).length,
  };
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
