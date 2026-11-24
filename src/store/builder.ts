import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { arrayMove } from '@dnd-kit/sortable';
import type { CoverPage, Heading, ParsedBrief, ResolvedFormat, RubricSource, TemplateConfig } from '@/lib/types';
import { makeConfig } from '@/lib/config';
import { makeId } from '@/lib/text';
import type { RubricInfo } from '@/lib/rubricInfo';
import type { Preset } from './presets';

export type Step = 0 | 1 | 2 | 3;
export const STEPS = ['Upload', 'Structure', 'Format & cover', 'Review & download'] as const;

export interface FileMeta {
  name: string;
  size: number;
}
export interface RubricMeta extends FileMeta, RubricInfo {
  /** A .docx is merged in unchanged; a .pdf is rebuilt as a table. */
  format?: 'docx' | 'pdf';
}

/** Where a click on a preview page should take the user. */
export type FocusTarget = { kind: 'cover' } | { kind: 'toc' } | { kind: 'heading'; id: string } | { kind: 'rubric' } | { kind: 'format' };

interface BuilderState {
  step: Step;
  briefFile?: FileMeta;
  brief?: ParsedBrief;
  config?: TemplateConfig;
  rubricFile?: RubricMeta;
  /** Rubric .docx bytes – kept in memory only, never persisted. */
  rubricBytes?: ArrayBuffer;
  /** A separate rubric PDF, rebuilt as a table. */
  rubricPdf?: Extract<RubricSource, { kind: 'pdf-pages' }>;
  focus?: { target: FocusTarget; nonce: number };

  setStep: (s: Step) => void;
  loadBrief: (brief: ParsedBrief, file: FileMeta, preset: Preset) => void;
  loadConfig: (config: TemplateConfig, briefName: string, rubricName?: string) => void;
  setRubric: (meta: RubricMeta, bytes: ArrayBuffer) => void;
  setRubricPdf: (meta: RubricMeta, source: Extract<RubricSource, { kind: 'pdf-pages' }>) => void;
  clearRubric: () => void;
  patchFormat: (p: Partial<ResolvedFormat>) => void;
  patchCover: (p: Partial<CoverPage>) => void;
  patchConfig: (p: Partial<Pick<TemplateConfig, 'onePartPerPage' | 'includeReferences'>>) => void;
  applyPreset: (p: Preset) => void;
  updateHeading: (id: string, p: Partial<Heading>) => void;
  moveHeading: (from: number, to: number) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  addHeading: (level: 1 | 2, afterId?: string) => string;
  removeHeading: (id: string) => void;
  focusOn: (t: FocusTarget) => void;
  reset: () => void;
}

/** Brief values win over preset values; the preset fills in what the brief doesn't say. */
function presetFormat(brief: ParsedBrief, base: ResolvedFormat, preset: Preset): ResolvedFormat {
  const f = brief.format;
  const pf = preset.format;
  return {
    ...base,
    font: f.font ? base.font : (pf.font ?? base.font),
    fontSizePt: f.fontSizePt ? base.fontSizePt : (pf.fontSizePt ?? base.fontSizePt),
    lineSpacing: f.lineSpacing ? base.lineSpacing : (pf.lineSpacing ?? base.lineSpacing),
    justified: f.justified ? base.justified : (pf.justified ?? base.justified),
    paper: f.paper ? base.paper : (pf.paper ?? base.paper),
    pageNumber: f.pageNumber ? base.pageNumber : (pf.pageNumber ?? base.pageNumber),
  };
}

function rubricSourceFor(s: Pick<BuilderState, 'brief' | 'rubricFile' | 'rubricPdf'>): RubricSource {
  if (s.rubricFile?.format === 'pdf' && s.rubricPdf) return s.rubricPdf;
  if (s.rubricFile) return { kind: 'docx', fileName: s.rubricFile.name };
  const r = s.brief?.rubric;
  if (r?.found && (r.pages.length || r.layout)) return { kind: 'pdf-pages', pages: r.pages, landscape: r.landscape, ...(r.layout ?? {}) };
  return { kind: 'none' };
}

const REFS = /^(references?|bibliography|reference list)$/i;

const withConfig = (s: BuilderState, fn: (c: TemplateConfig) => TemplateConfig): Partial<BuilderState> =>
  s.config ? { config: fn(s.config) } : {};

export const useBuilder = create<BuilderState>()(
  persist(
    (set, get) => ({
      step: 0,
      setStep: (step) => set({ step }),

      loadBrief: (brief, file, preset) => {
        const c = makeConfig(brief, { universityName: preset.universityName, ...(preset.logo ? { logo: preset.logo } : {}) });
        const hasGroup = !!brief.cover.groupSize;
        const config: TemplateConfig = {
          ...c,
          format: presetFormat(brief, c.format, preset),
          cover: {
            ...c.cover,
            showPictureColumn: preset.cover.showPictureColumn,
            memberRows: hasGroup ? c.cover.memberRows : preset.cover.memberRows,
          },
          rubric: rubricSourceFor({ brief, rubricFile: get().rubricFile, rubricPdf: get().rubricPdf }),
          ...(preset.builtIn ? {} : { presetId: preset.id }),
        };
        set({ brief, briefFile: file, config });
      },

      loadConfig: (config, briefName) =>
        set({
          config,
          brief: undefined,
          briefFile: { name: briefName, size: 0 },
          rubricFile: undefined,
          rubricBytes: undefined,
          rubricPdf: undefined,
          step: 3,
        }),

      setRubric: (meta, bytes) =>
        set((s) => ({
          rubricFile: { ...meta, format: 'docx' },
          rubricBytes: bytes,
          rubricPdf: undefined,
          ...withConfig(s, (c) => ({ ...c, rubric: { kind: 'docx', fileName: meta.name } })),
        })),

      setRubricPdf: (meta, source) =>
        set((s) => ({
          rubricFile: { ...meta, format: 'pdf' },
          rubricBytes: undefined,
          rubricPdf: source,
          ...withConfig(s, (c) => ({ ...c, rubric: source })),
        })),

      clearRubric: () =>
        set((s) => ({
          rubricFile: undefined,
          rubricBytes: undefined,
          rubricPdf: undefined,
          ...withConfig(s, (c) => ({ ...c, rubric: rubricSourceFor({ brief: s.brief, rubricFile: undefined }) })),
        })),

      patchFormat: (p) => set((s) => withConfig(s, (c) => ({ ...c, format: { ...c.format, ...p } }))),
      patchCover: (p) => set((s) => withConfig(s, (c) => ({ ...c, cover: { ...c.cover, ...p } }))),
      patchConfig: (p) =>
        set((s) =>
          withConfig(s, (c) => {
            const next = { ...c, ...p };
            // The References toggle and the References heading stay in sync.
            if (p.includeReferences === true && !c.headings.some((h) => REFS.test(h.text.trim())))
              next.headings = [...c.headings, { id: makeId('h'), level: 1, text: 'References', confidence: 1, origin: 'user' }];
            if (p.includeReferences === false) next.headings = c.headings.filter((h) => !REFS.test(h.text.trim()));
            return next;
          }),
        ),

      applyPreset: (preset) =>
        set((s) =>
          withConfig(s, (c) => ({
            ...c,
            ...(preset.builtIn ? { presetId: undefined } : { presetId: preset.id }),
            format: s.brief ? presetFormat(s.brief, c.format, preset) : { ...c.format, ...preset.format },
            cover: {
              ...c.cover,
              universityName: preset.universityName,
              ...(preset.logo ? { logo: preset.logo } : { logo: undefined }),
              showPictureColumn: preset.cover.showPictureColumn,
            },
          })),
        ),

      updateHeading: (id, p) =>
        set((s) => withConfig(s, (c) => ({ ...c, headings: c.headings.map((h) => (h.id === id ? { ...h, ...p } : h)) }))),
      moveHeading: (from, to) => set((s) => withConfig(s, (c) => ({ ...c, headings: arrayMove(c.headings, from, to) }))),
      indent: (id) =>
        set((s) =>
          withConfig(s, (c) => {
            const i = c.headings.findIndex((h) => h.id === id);
            // The first heading can't be an H2 – there's nothing to nest under.
            if (i <= 0) return c;
            return { ...c, headings: c.headings.map((h) => (h.id === id ? { ...h, level: 2 as const } : h)) };
          }),
        ),
      outdent: (id) =>
        set((s) => withConfig(s, (c) => ({ ...c, headings: c.headings.map((h) => (h.id === id ? { ...h, level: 1 as const } : h)) }))),
      addHeading: (level, afterId) => {
        const id = makeId('h');
        set((s) =>
          withConfig(s, (c) => {
            const h: Heading = { id, level, text: level === 1 ? 'New part' : 'New sub-task', confidence: 1, origin: 'user' };
            const at = afterId ? c.headings.findIndex((x) => x.id === afterId) + 1 : c.headings.length;
            const headings = [...c.headings];
            headings.splice(at, 0, h);
            return { ...c, headings };
          }),
        );
        return id;
      },
      removeHeading: (id) =>
        set((s) =>
          withConfig(s, (c) => {
            const gone = c.headings.find((h) => h.id === id);
            const headings = c.headings.filter((h) => h.id !== id);
            const stillRefs = headings.some((h) => REFS.test(h.text.trim()));
            return { ...c, headings, ...(gone && REFS.test(gone.text.trim()) && !stillRefs ? { includeReferences: false } : {}) };
          }),
        ),

      focusOn: (target) => {
        const step: Step = target.kind === 'rubric' ? 0 : target.kind === 'cover' || target.kind === 'format' ? 2 : 1;
        set({ step, focus: { target, nonce: Date.now() } });
      },

      reset: () =>
        set({
          step: 0,
          brief: undefined,
          briefFile: undefined,
          config: undefined,
          rubricFile: undefined,
          rubricBytes: undefined,
          rubricPdf: undefined,
          focus: undefined,
        }),
    }),
    {
      name: 'rtb-builder',
      version: 1,
      // Files are never stored. The parsed brief text stays only so a refresh doesn't lose work.
      partialize: (s) => ({ step: s.step, briefFile: s.briefFile, brief: s.brief, config: s.config }),
    },
  ),
);

/** Pages the rubric takes in the template (for page-count estimates). */
export function rubricPageCount(s: Pick<BuilderState, 'config' | 'rubricFile'>): number {
  const r = s.config?.rubric;
  if (!r || r.kind === 'none') return 0;
  if (r.kind === 'docx') return Math.max(1, s.rubricFile?.pages ?? 1);
  return Math.max(1, r.pages.length || Math.ceil((r.rows?.length ?? 0) / 8));
}
