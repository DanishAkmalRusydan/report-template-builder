// Shared regular expressions for detection.

/** "PART A: …", "Part 1 – …", "SECTION 2: …", "Chapter 3. …", "Question 4 …" */
export const H1_PART_RE =
  /^(part|section|chapter|question|module|unit)\s+([A-Z]|\d{1,2}|[IVX]{1,5})(?![A-Za-z0-9])\s*([:.\-–—)]?)\s*(.*)$/i;

/** "Task B1: …", "Task 2.1 …", "Activity 3: …", "Exercise 2 - …" */
export const H2_TASK_RE =
  /^(task|activity|exercise|sub-?task|lab task)\s+([A-Z]?\d{1,2}(?:\.\d{1,2})*[a-z]?|[A-Z])(?![A-Za-z0-9])\s*([:.\-–—)]?)\s*(.*)$/i;

/** "1. Business Sector and Current Issues", "2) Proposed Solution" */
export const NUMBERED_RE = /^(\d{1,2})[.)]\s+(.+)$/;

/** Short trailer line appended to a part heading: "(CHAPTER 5)", "(Week 3)", "(20 marks)". */
export const HEADING_TRAILER_RE = /^\((?:chapter|week|topic|lecture|unit)\s*\d{1,2}\)$/i;

/** Section titles whose content must never yield headings. */
export const IGNORE_SECTION_RE =
  /^(deliverables?|documentation format|report requirements?|format(ting)?( requirements?| guidelines?)?|submission( guidelines?| requirements?)?|instructions?( to students)?|marking (scheme|rubric)|rubrics?|assessment criteria|course outcomes?(\(s\))?|clo|plagiarism|important notes?|notes?|report structure|guidelines?)(\s+(for|of|to)\b.*)?\s*:?$/i;

export const REFERENCES_RE = /^(references?|bibliography|reference list|list of references|works cited)$/i;

export const BULLET_RE = /^[•●○◦▪■\-–*o]\s+/;

export const STEP_RE = /^(step|case|example|note|hint|tip)\s*\d*\s*[:.)]/i;

export const KNOWN_FONTS = [
  'Times New Roman',
  'Arial',
  'Calibri',
  'Cambria',
  'Helvetica',
  'Georgia',
  'Verdana',
  'Garamond',
  'Century Gothic',
  'Tahoma',
  'Book Antiqua',
] as const;

/** Approximate Word theme colours for colour names that appear in briefs. */
export const COLOUR_NAMES: Record<string, string> = {
  'light blue': 'DCEBF7',
  'sky blue': 'BDD7EE',
  'baby blue': 'DCEBF7',
  'dark blue': '1F3864',
  'navy blue': '1F3864',
  navy: '1F3864',
  blue: '9DC3E6',
  'light green': 'E2EFDA',
  green: 'A9D08E',
  'light yellow': 'FFF2CC',
  yellow: 'FFE699',
  'light pink': 'FCE4EC',
  pink: 'F8BBD0',
  'light purple': 'E4DFEC',
  purple: 'CDB4DB',
  'light grey': 'EDEDED',
  'light gray': 'EDEDED',
  grey: 'D9D9D9',
  gray: 'D9D9D9',
  orange: 'F8CBAD',
  'light orange': 'FBE5D6',
  peach: 'FBE5D6',
  maroon: 'C00000',
  red: 'FF9999',
  white: 'FFFFFF',
};
