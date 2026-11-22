// Shared data model for the Report Template Builder engine.
// Everything in src/lib is pure TypeScript with no React dependency.

/** Where a detected value came from in the brief. */
export interface SourceRef {
  /** Index into ParsedBrief.lines. */
  index: number;
  /** 1-based page number (PDF only). */
  page?: number;
  /** The original line text. */
  line: string;
}

export interface Sourced<T> {
  value: T;
  source?: SourceRef;
}

/** One normalised line of brief text, from either a .docx paragraph or a PDF text line. */
export interface BriefLine {
  index: number;
  text: string;
  bold: boolean;
  page?: number;
  inTable: boolean;
  /** 0-based table cell column, when inside a table. */
  tableCol?: number;
  /** 0-based table row and table id (.docx only). */
  tableRow?: number;
  tableId?: number;
  styleName?: string;
  /** Left x position in points (PDF only). */
  x?: number;
  /** Font size in points (PDF only). */
  fontSize?: number;
  /** True for running headers/footers repeated across PDF pages. */
  repeated?: boolean;
}

export interface Heading {
  id: string;
  level: 1 | 2;
  text: string;
  /** 0..1. Below LOW_CONFIDENCE the UI flags the heading for review. */
  confidence: number;
  source?: SourceRef;
  origin: 'detected' | 'user';
}

export const LOW_CONFIDENCE = 0.6;

export type FontName = 'Arial' | 'Times New Roman' | 'Calibri' | (string & {});
export type PageNumberPosition = 'bottom-right' | 'bottom-center' | 'bottom-left' | 'top-right' | 'none';
export type PaperSize = 'A4' | 'Letter';

export interface FormatRules {
  font?: Sourced<FontName>;
  fontSizePt?: Sourced<number>;
  lineSpacing?: Sourced<number>;
  justified?: Sourced<boolean>;
  paper?: Sourced<PaperSize>;
  pageNumber?: Sourced<PageNumberPosition>;
  /** Hex colour without '#', e.g. "DCEBF7". */
  coverColour?: Sourced<{ name: string; hex: string }>;
  maxPages?: Sourced<number>;
  /** ISO date yyyy-mm-dd. */
  dueDate?: Sourced<string>;
}

/** Resolved format values with defaults applied (what the generator uses). */
export interface ResolvedFormat {
  font: FontName;
  fontSizePt: number;
  lineSpacing: number;
  justified: boolean;
  paper: PaperSize;
  pageNumber: PageNumberPosition;
  coverColourHex?: string;
}

export const DEFAULT_FORMAT: ResolvedFormat = {
  font: 'Times New Roman',
  fontSizePt: 12,
  lineSpacing: 1.5,
  justified: true,
  paper: 'A4',
  pageNumber: 'bottom-right',
};

export type GroupType = 'individual' | 'group' | 'unknown';

export interface CoverField {
  label: string;
  value: string;
}

export interface DetectedCover {
  subjectCode?: Sourced<string>;
  subjectName?: Sourced<string>;
  assignmentName?: Sourced<string>;
  assignmentTitle?: Sourced<string>;
  lecturer?: Sourced<string>;
  weightage?: Sourced<string>;
  semester?: Sourced<string>;
  /** Group type stated in the brief's instructions (e.g. "Group of 3 – 5"). */
  groupType: Sourced<GroupType>;
  /** Group type stated on the brief's own cover sheet, if it has one. */
  coverGroupType?: Sourced<GroupType>;
  groupSize?: { min: number; max: number };
  briefHasCover: boolean;
  /** Page numbers (PDF) of the brief's own cover sheet. */
  coverPages?: number[];
  /** Label/value fields read from the brief's cover sheet. */
  coverFields: CoverField[];
}

export interface CoverPage {
  mode: 'from-brief' | 'generated';
  universityName: string;
  logo?: { dataUrl: string; widthPx: number; heightPx: number };
  subjectCode: string;
  subjectName: string;
  assignmentName: string;
  assignmentTitle: string;
  lecturer: string;
  semester?: string;
  weightage?: string;
  memberRows: number;
  showPictureColumn: boolean;
  briefFields: CoverField[];
}

/** A rubric rebuilt from PDF text: title lines, table rows (header rows first), trailing lines. */
export interface RubricLayout {
  before: string[];
  rows: string[][];
  after: string[];
}

export type RubricSource =
  | { kind: 'none' }
  | { kind: 'docx'; fileName: string; bytes?: ArrayBuffer }
  | ({ kind: 'pdf-pages'; pages: number[]; landscape: boolean } & Partial<RubricLayout>);

export interface DetectedRubric {
  found: boolean;
  pages: number[];
  landscape: boolean;
  confidence: number;
  /** Table rebuilt from the PDF pages, when the layout could be read. */
  layout?: RubricLayout;
}

export type IssueSeverity = 'info' | 'warning';

export interface Issue {
  id: string;
  severity: IssueSeverity;
  message: string;
  fix?: string;
  source?: SourceRef;
}

export interface PageSize {
  page: number;
  width: number;
  height: number;
  landscape: boolean;
}

export interface ParsedBrief {
  fileName: string;
  kind: 'docx' | 'pdf' | 'text';
  lines: BriefLine[];
  pageSizes: PageSize[];
  headings: Heading[];
  format: FormatRules;
  cover: DetectedCover;
  rubric: DetectedRubric;
  wantsReferences: boolean;
  deliverables: Sourced<string>[];
  issues: Issue[];
}

export interface TemplateConfig {
  id: string;
  createdAt: string;
  presetId?: string;
  headings: Heading[];
  format: ResolvedFormat;
  cover: CoverPage;
  onePartPerPage: boolean;
  includeReferences: boolean;
  rubric: RubricSource;
}
