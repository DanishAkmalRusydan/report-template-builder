import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TemplateConfig } from '@/lib/types';

/** A template built before. Config only – never the uploaded files. */
export interface HistoryEntry {
  id: string;
  savedAt: string;
  fileName: string;
  briefName: string;
  rubricName?: string;
  config: TemplateConfig;
}

/** Strip anything file-derived that must not be stored (rubric bytes). */
export function storableConfig(c: TemplateConfig): TemplateConfig {
  if (c.rubric.kind === 'docx') {
    const { bytes: _bytes, ...rest } = c.rubric;
    return { ...c, rubric: rest };
  }
  return c;
}

interface HistoryState {
  entries: HistoryEntry[];
  add: (e: Omit<HistoryEntry, 'id' | 'savedAt'>) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
}

const MAX = 30;

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) =>
        set((s) => {
          const entry: HistoryEntry = { ...e, config: storableConfig(e.config), id: `h_${Date.now().toString(36)}`, savedAt: new Date().toISOString() };
          // Rebuilding the same config replaces its previous entry.
          const rest = s.entries.filter((x) => x.config.id !== e.config.id);
          return { entries: [entry, ...rest].slice(0, MAX) };
        }),
      duplicate: (id) =>
        set((s) => {
          const src = s.entries.find((x) => x.id === id);
          if (!src) return s;
          const now = Date.now().toString(36);
          const copy: HistoryEntry = {
            ...src,
            id: `h_${now}`,
            savedAt: new Date().toISOString(),
            config: { ...src.config, id: `tpl_${now}`, cover: { ...src.config.cover, assignmentName: `${src.config.cover.assignmentName} (copy)` } },
          };
          return { entries: [copy, ...s.entries].slice(0, MAX) };
        }),
      remove: (id) => set((s) => ({ entries: s.entries.filter((x) => x.id !== id) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'rtb-history', version: 1 },
  ),
);
