import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { Heading, TemplateConfig } from '@/lib/types';
import { effectiveHeadings } from '@/lib/generate/headings';
import { estimateHeadingPages } from '@/lib/generate/toc';
import { useBuilder, type FocusTarget, type RubricMeta } from '@/store/builder';
import { cn } from '@/lib/utils';

/** Points → px at this thumbnail scale (A4 is 595pt wide). */
const PAGE_W = 272;
const pt = (n: number, landscape = false) => (n * (landscape ? PAGE_W * (297 / 210) : PAGE_W)) / (landscape ? 842 : 595);

interface PageSpec {
  key: string;
  label: string;
  landscape?: boolean;
  target: FocusTarget;
  content: ReactNode;
  pageNo?: number;
  background?: string;
}

function PageNumber({ config, n, landscape }: { config: TemplateConfig; n: number; landscape?: boolean }) {
  const pos = config.format.pageNumber;
  if (pos === 'none') return null;
  const style: CSSProperties = { fontSize: pt(config.format.fontSizePt * 0.9, landscape), padding: pt(36, landscape) };
  return (
    <span
      className={cn(
        'absolute text-paper-ink/70',
        pos === 'top-right' ? 'right-0 top-0' : 'bottom-0',
        pos === 'bottom-right' && 'right-0',
        pos === 'bottom-left' && 'left-0',
        pos === 'bottom-center' && 'left-1/2 -translate-x-1/2',
      )}
      style={style}
    >
      {n}
    </span>
  );
}

function Cover({ config }: { config: TemplateConfig }) {
  const c = config.cover;
  const fs = config.format.fontSizePt;
  const rows = Math.max(1, Math.min(8, c.memberRows));
  const rowH = Math.max(pt(30), Math.min(pt(c.showPictureColumn ? 85 : 25), pt(300 / rows)));
  return (
    <div className="flex h-full flex-col items-center text-center text-paper-ink" style={{ gap: pt(6) }}>
      {c.logo && <img src={c.logo.dataUrl} alt="" className="object-contain" style={{ maxHeight: pt(60), maxWidth: pt(150) }} />}
      {c.universityName && (
        <p className="font-bold" style={{ fontSize: pt(fs + 4) }}>
          {c.universityName}
        </p>
      )}
      <div style={{ height: pt(c.mode === 'from-brief' ? 6 : 18) }} />
      {c.mode === 'from-brief' ? (
        <>
          <p className="font-bold" style={{ fontSize: pt(fs + 4) }}>
            {c.subjectName}
          </p>
          {c.subjectCode && <p className="font-bold" style={{ fontSize: pt(fs) }}>({c.subjectCode})</p>}
        </>
      ) : (
        <p className="font-bold" style={{ fontSize: pt(fs + 4) }}>
          {[c.subjectCode, c.subjectName].filter(Boolean).join(' ')}
        </p>
      )}
      {c.assignmentName && <p className="font-bold" style={{ fontSize: pt(fs) }}>{c.assignmentName}</p>}
      {c.assignmentTitle && <p className="italic" style={{ fontSize: pt(fs) }}>{c.assignmentTitle}</p>}
      {c.mode === 'from-brief' && c.briefFields.length > 0 ? (
        <table className="mt-1 w-full border-collapse text-left" style={{ fontSize: pt(fs - 1) }}>
          <tbody>
            {c.briefFields.map((f, i) => (
              <tr key={i}>
                <td className="w-2/5 border border-paper-ink/60 font-bold" style={{ padding: pt(3) }}>
                  {f.label}
                </td>
                <td className="border border-paper-ink/60" style={{ padding: pt(3) }}>
                  {f.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        c.lecturer && <p style={{ fontSize: pt(fs) }}>Lecturer: {c.lecturer}</p>
      )}
      <table className="mt-auto w-full table-fixed border-collapse" style={{ fontSize: pt(fs - 1) }}>
        <thead>
          <tr className="bg-black/5 font-bold">
            {c.showPictureColumn && <td className="w-1/5 border border-paper-ink/60" style={{ padding: pt(2) }}>Picture</td>}
            <td className="border border-paper-ink/60" style={{ padding: pt(2) }}>
              Name
            </td>
            <td className="w-[30%] border border-paper-ink/60" style={{ padding: pt(2) }}>
              Student ID
            </td>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} style={{ height: rowH }}>
              {c.showPictureColumn && <td className="border border-paper-ink/60" />}
              <td className="border border-paper-ink/60" />
              <td className="border border-paper-ink/60" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Toc({ config }: { config: TemplateConfig }) {
  const entries = estimateHeadingPages(config);
  const fs = config.format.fontSizePt;
  return (
    <div className="text-paper-ink">
      <p className="text-center font-bold" style={{ fontSize: pt(fs + 2), marginBottom: pt(10) }}>
        TABLE OF CONTENTS
      </p>
      <ul style={{ fontSize: pt(fs) }}>
        {entries.slice(0, 26).map((e, i) => (
          <li key={i} className="flex items-baseline" style={{ paddingLeft: e.level === 2 ? pt(12) : 0, marginBottom: pt(fs * (config.format.lineSpacing - 0.6)) }}>
            <span className="truncate">{e.text}</span>
            <span className="mx-[2px] flex-1 border-b border-dotted border-paper-ink/50" />
            <span>{e.page}</span>
          </li>
        ))}
        {entries.length > 26 && <li className="text-paper-ink/50">…</li>}
      </ul>
    </div>
  );
}

function BodyPage({ config, headings }: { config: TemplateConfig; headings: Heading[] }) {
  const fs = config.format.fontSizePt;
  const lh = config.format.lineSpacing;
  return (
    <div className="text-paper-ink">
      {headings.map((h) => (
        <div key={h.id} style={{ marginBottom: pt(fs * lh * (h.level === 1 ? 1.4 : 1.1)) }}>
          <p className="font-bold leading-tight" style={{ fontSize: pt(fs + (h.level === 1 ? 2 : 1)) }}>
            {h.text}
          </p>
          {/* Faint guides showing where the student's writing goes; nothing is written into the real file. */}
          <div className="opacity-50" style={{ marginTop: pt(6) }} aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="border-b border-dashed border-paper-rule" style={{ height: pt(fs * lh) }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function RubricThumb({ config, rubricFile }: { config: TemplateConfig; rubricFile?: RubricMeta }) {
  const r = config.rubric;
  const rows: string[][] = r.kind === 'pdf-pages' ? (r.rows ?? []) : (rubricFile?.sample ?? []);
  const title = r.kind === 'pdf-pages' ? r.before?.find((t) => /rubric/i.test(t)) : rubricFile?.title;
  const L = r.kind === 'pdf-pages' ? r.landscape : (rubricFile?.landscape ?? true);
  const cols = Math.max(1, ...rows.map((x) => x.length));
  return (
    <div className="text-paper-ink" style={{ fontSize: pt(7, L) }}>
      {title && (
        <p className="font-bold" style={{ fontSize: pt(10, L), marginBottom: pt(6, L) }}>
          {title}
        </p>
      )}
      {rows.length ? (
        <table className="w-full table-fixed border-collapse">
          <tbody>
            {rows.slice(0, 7).map((row, i) => (
              <tr key={i} className={cn(i === 0 && 'bg-black/5 font-bold')}>
                {Array.from({ length: cols }).map((_, j) => (
                  <td key={j} className="border border-paper-ink/50 align-top" style={{ padding: pt(2, L), height: pt(i === 0 ? 14 : 34, L) }}>
                    <span className="line-clamp-3">{row[j]}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="grid h-24 place-items-center border border-dashed border-paper-rule text-paper-ink/50">{rubricFile?.name ?? 'Rubric'}</div>
      )}
    </div>
  );
}

export function usePages(): PageSpec[] {
  const { config, rubricFile } = useBuilder();
  return useMemo(() => {
    if (!config) return [];
    const pages: PageSpec[] = [
      {
        key: 'cover',
        label: 'Cover',
        target: { kind: 'cover' },
        content: <Cover config={config} />,
        ...(config.format.coverColourHex ? { background: `#${config.format.coverColourHex}` } : {}),
      },
      { key: 'toc', label: 'Contents', target: { kind: 'toc' }, content: <Toc config={config} />, pageNo: 2 },
    ];
    const hs = effectiveHeadings(config);
    const groups: Heading[][] = [];
    for (const h of hs) {
      if (groups.length === 0 || (h.level === 1 && config.onePartPerPage)) groups.push([h]);
      else groups[groups.length - 1]!.push(h);
    }
    // Without one-part-per-page, the body flows: split long runs so thumbnails stay readable.
    const flowed = config.onePartPerPage ? groups : groups.flatMap((g) => Array.from({ length: Math.ceil(g.length / 8) }, (_, i) => g.slice(i * 8, i * 8 + 8)));
    flowed.forEach((g, i) => {
      const first = g[0]!;
      pages.push({
        key: `body-${first.id}-${i}`,
        label: first.text,
        target: { kind: 'heading', id: first.id },
        content: <BodyPage config={config} headings={g} />,
        pageNo: 3 + i,
      });
    });
    if (config.rubric.kind !== 'none') {
      const landscape = config.rubric.kind === 'pdf-pages' ? config.rubric.landscape : (rubricFile?.landscape ?? true);
      const n = config.rubric.kind === 'docx' ? Math.max(1, rubricFile?.pages ?? 1) : Math.max(1, config.rubric.pages.length);
      pages.push({
        key: 'rubric',
        label: n > 1 ? `Rubric (${n} pages)` : 'Rubric',
        landscape,
        target: { kind: 'rubric' },
        content: <RubricThumb config={config} rubricFile={rubricFile} />,
        pageNo: 3 + flowed.length,
      });
    }
    return pages;
  }, [config, rubricFile]);
}

export function LivePreview({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const config = useBuilder((s) => s.config);
  const focusOn = useBuilder((s) => s.focusOn);
  const pages = usePages();
  if (!config) {
    return (
      <div className={cn('flex flex-col items-center gap-3 pt-10 text-center text-sm text-muted-foreground', className)}>
        <div className="aspect-[210/297] w-40 rounded-[3px] border-2 border-dashed" />
        Your template preview appears here.
      </div>
    );
  }
  return (
    <div className={cn('flex flex-col items-center gap-5', className)} style={{ fontFamily: `"${config.format.font}", serif` }}>
      {pages.map((p, i) => {
        const w = p.landscape ? PAGE_W * (297 / 210) : PAGE_W;
        return (
          <motion.figure key={p.key} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="m-0">
            <button
              type="button"
              onClick={() => {
                focusOn(p.target);
                onNavigate?.();
              }}
              aria-label={`Page ${i + 1}: ${p.label}. Go to its settings.`}
              className="group relative block overflow-hidden rounded-[2px] bg-paper text-left shadow-page ring-1 ring-black/5 transition-transform hover:-translate-y-0.5 hover:shadow-lift"
              style={{
                width: w,
                aspectRatio: p.landscape ? '297 / 210' : config.format.paper === 'Letter' ? '216 / 279' : '210 / 297',
                background: p.background,
                textAlign: config.format.justified ? 'justify' : 'left',
              }}
            >
              <div className="h-full overflow-hidden" style={{ padding: pt(54, p.landscape) }}>
                {p.content}
              </div>
              {p.pageNo !== undefined && <PageNumber config={config} n={p.pageNo} landscape={p.landscape} />}
              <span className="pointer-events-none absolute inset-0 rounded-[2px] ring-2 ring-warm/0 transition group-hover:ring-warm/60" />
            </button>
            <figcaption className="mt-1.5 flex max-w-full gap-1.5 truncate font-sans text-xs text-muted-foreground" style={{ width: w }}>
              <span className="tabular-nums text-foreground">{i + 1}</span>
              <span className="truncate">{p.label}</span>
            </figcaption>
          </motion.figure>
        );
      })}
    </div>
  );
}
