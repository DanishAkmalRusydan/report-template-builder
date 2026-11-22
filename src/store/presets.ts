import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CoverPage, ResolvedFormat } from '@/lib/types';
import { PLACEHOLDER_LOGO } from '@/assets/placeholderLogo';

/** A saved "university profile": branding plus default formatting, applied when a brief doesn't say. */
export interface Preset {
  id: string;
  name: string;
  universityName: string;
  logo?: CoverPage['logo'];
  format: Partial<ResolvedFormat>;
  cover: { showPictureColumn: boolean; memberRows: number };
  builtIn?: boolean;
}

export const DEFAULT_PRESET: Preset = {
  id: 'default',
  name: 'Generic university',
  universityName: 'Your University',
  logo: PLACEHOLDER_LOGO,
  format: { font: 'Times New Roman', fontSizePt: 12, lineSpacing: 1.5, justified: true, paper: 'A4', pageNumber: 'bottom-right' },
  cover: { showPictureColumn: true, memberRows: 2 },
  builtIn: true,
};

interface PresetState {
  presets: Preset[];
  activeId: string;
  setActive: (id: string) => void;
  save: (p: Omit<Preset, 'id'> & { id?: string }) => string;
  remove: (id: string) => void;
}

export const usePresets = create<PresetState>()(
  persist(
    (set, get) => ({
      presets: [DEFAULT_PRESET],
      activeId: DEFAULT_PRESET.id,
      setActive: (id) => set({ activeId: id }),
      save: (p) => {
        const id = p.id && !get().presets.find((x) => x.id === p.id)?.builtIn ? p.id : `preset_${Date.now().toString(36)}`;
        const next: Preset = { ...p, id, builtIn: false };
        set((s) => ({ presets: [...s.presets.filter((x) => x.id !== id), next], activeId: id }));
        return id;
      },
      remove: (id) =>
        set((s) => ({
          presets: s.presets.filter((x) => x.id !== id || x.builtIn),
          activeId: s.activeId === id ? DEFAULT_PRESET.id : s.activeId,
        })),
    }),
    {
      name: 'rtb-presets',
      version: 1,
      // Always ship the current built-in default.
      merge: (persisted, current) => {
        const p = persisted as Partial<PresetState> | undefined;
        const custom = (p?.presets ?? []).filter((x) => !x.builtIn);
        return { ...current, ...p, presets: [DEFAULT_PRESET, ...custom] };
      },
    },
  ),
);

export const activePreset = (s: PresetState): Preset => s.presets.find((p) => p.id === s.activeId) ?? DEFAULT_PRESET;
