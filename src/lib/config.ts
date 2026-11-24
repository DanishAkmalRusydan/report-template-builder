import type { CoverPage, ParsedBrief, ResolvedFormat, RubricSource, TemplateConfig } from './types';
import { DEFAULT_FORMAT } from './types';
import { makeId } from './text';

export interface ConfigOverrides {
  universityName?: string;
  logo?: CoverPage['logo'];
  memberRows?: number;
  rubric?: RubricSource;
  applyCoverColour?: boolean;
}

/** Resolve detected format rules into concrete values, falling back to defaults. */
export function resolveFormat(brief: ParsedBrief, applyCoverColour = true): ResolvedFormat {
  const f = brief.format;
  return {
    font: f.font?.value ?? DEFAULT_FORMAT.font,
    fontSizePt: f.fontSizePt?.value ?? DEFAULT_FORMAT.fontSizePt,
    lineSpacing: f.lineSpacing?.value ?? DEFAULT_FORMAT.lineSpacing,
    justified: f.justified?.value ?? DEFAULT_FORMAT.justified,
    paper: f.paper?.value ?? DEFAULT_FORMAT.paper,
    pageNumber: f.pageNumber?.value ?? DEFAULT_FORMAT.pageNumber,
    ...(applyCoverColour && f.coverColour ? { coverColourHex: f.coverColour.value.hex } : {}),
  };
}

/** The initial TemplateConfig for a parsed brief (what the wizard starts from). */
export function makeConfig(brief: ParsedBrief, o: ConfigOverrides = {}): TemplateConfig {
  const c = brief.cover;
  const groupRows = c.groupSize ? Math.min(8, Math.max(1, c.groupSize.max)) : 2;
  const memberRows = o.memberRows ?? (c.groupType.value === 'individual' && !c.coverGroupType ? 1 : groupRows);
  const rubric: RubricSource =
    o.rubric ??
    (brief.rubric.found && (brief.rubric.pages.length || brief.rubric.layout)
      ? { kind: 'pdf-pages', pages: brief.rubric.pages, landscape: brief.rubric.landscape, ...(brief.rubric.layout ?? {}) }
      : { kind: 'none' });
  return {
    id: makeId('tpl'),
    createdAt: new Date().toISOString(),
    headings: brief.headings.map((h) => ({ ...h })),
    format: resolveFormat(brief, o.applyCoverColour ?? true),
    cover: {
      mode: c.briefHasCover ? 'from-brief' : 'generated',
      universityName: o.universityName ?? '',
      ...(o.logo ? { logo: o.logo } : {}),
      subjectCode: c.subjectCode?.value ?? '',
      subjectName: c.subjectName?.value ?? '',
      assignmentName: c.assignmentName?.value ?? '',
      assignmentTitle: c.assignmentTitle?.value ?? '',
      lecturer: c.lecturer?.value ?? '',
      ...(c.semester ? { semester: c.semester.value } : {}),
      ...(c.weightage ? { weightage: c.weightage.value } : {}),
      memberRows,
      showPictureColumn: true,
      briefFields: c.coverFields,
      ...(c.layout ? { briefLayout: c.layout } : {}),
    },
    onePartPerPage: true,
    includeReferences: brief.wantsReferences,
    rubric,
  };
}
