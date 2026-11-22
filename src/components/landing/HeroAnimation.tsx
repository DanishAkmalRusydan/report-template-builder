import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * A brief (left) is scanned, its headings light up, then the template pages
 * (cover, contents, parts, rubric) fan out on the right. Loops; static when
 * the user prefers reduced motion.
 */
const BRIEF = [
  { w: 70, kind: 'title' },
  { w: 92 },
  { w: 84 },
  { w: 48, kind: 'heading', label: 'PART A' },
  { w: 95 },
  { w: 76 },
  { w: 40, kind: 'sub', label: 'Task A1' },
  { w: 88 },
  { w: 52, kind: 'heading', label: 'PART B' },
  { w: 90 },
  { w: 66 },
  { w: 44, kind: 'sub', label: 'Task B1' },
  { w: 80 },
  { w: 36, kind: 'format', label: 'Arial 11 · 1.5' },
] as const;

function Line({ w, kind, lit }: { w: number; kind?: string; lit: boolean }) {
  const tone =
    kind === 'title'
      ? 'h-2.5 bg-paper-ink/70'
      : kind === 'heading'
        ? 'h-2 bg-paper-ink/55'
        : kind === 'sub' || kind === 'format'
          ? 'h-1.5 bg-paper-ink/40'
          : 'h-1.5 bg-paper-rule';
  return (
    <div className="relative">
      <div className={cn('rounded-full', tone)} style={{ width: `${w}%` }} />
      {kind && kind !== 'title' && (
        <motion.div
          aria-hidden
          className="absolute -inset-x-1 -inset-y-1 rounded bg-warm/25"
          initial={false}
          animate={{ opacity: lit ? 1 : 0, scaleX: lit ? 1 : 0.2 }}
          style={{ originX: 0, width: `calc(${w}% + 8px)` }}
          transition={{ duration: 0.35 }}
        />
      )}
    </div>
  );
}

function Page({ children, className, landscape }: { children: React.ReactNode; className?: string; landscape?: boolean }) {
  return (
    <div
      className={cn('absolute rounded-[3px] bg-paper shadow-page ring-1 ring-black/5', landscape ? 'aspect-[297/210] w-40' : 'aspect-[210/297] w-28', className)}
    >
      {children}
    </div>
  );
}

export function HeroAnimation() {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState(reduce ? 3 : 0); // 0 idle, 1 scanning, 2 pages, 3 hold

  useEffect(() => {
    if (reduce) return;
    const seq = [900, 2200, 2600, 1800];
    let i = 0;
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      i = (i + 1) % 4;
      setPhase(i);
      t = setTimeout(tick, seq[i]);
    };
    t = setTimeout(tick, seq[0]);
    return () => clearTimeout(t);
  }, [reduce]);

  const lit = (idx: number) => phase >= 1 && (phase > 1 || idx < BRIEF.length);
  const showPages = phase >= 2;

  const pages = [
    {
      key: 'cover',
      el: (
        <Page className="overflow-hidden">
          <div className="absolute inset-0 bg-[#dcebf7]" />
          <div className="relative flex h-full flex-col items-center gap-1.5 px-3 pt-4">
            <div className="size-4 rounded-sm bg-primary/80" />
            <div className="h-1.5 w-14 rounded-full bg-paper-ink/60" />
            <div className="mt-1 h-1 w-16 rounded-full bg-paper-ink/40" />
            <div className="h-1 w-12 rounded-full bg-paper-ink/30" />
            <div className="mt-auto mb-3 grid w-full grid-cols-3 gap-px rounded-sm bg-paper-ink/25 p-px">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className={cn('h-2.5 bg-[#dcebf7]', i < 3 && 'bg-white/70')} />
              ))}
            </div>
          </div>
        </Page>
      ),
    },
    {
      key: 'toc',
      el: (
        <Page>
          <div className="flex flex-col gap-1.5 px-3 pt-4">
            <div className="mx-auto mb-1 h-1.5 w-12 rounded-full bg-paper-ink/60" />
            {[80, 64, 72, 58, 76].map((w, i) => (
              <div key={i} className="flex items-center gap-1">
                <div className={cn('h-1 rounded-full bg-paper-ink/45', i % 2 && 'ml-2')} style={{ width: `${w * 0.55}%` }} />
                <div className="h-px flex-1 border-b border-dotted border-paper-ink/30" />
                <div className="h-1 w-1.5 rounded-full bg-paper-ink/45" />
              </div>
            ))}
          </div>
        </Page>
      ),
    },
    {
      key: 'part',
      el: (
        <Page>
          <div className="flex flex-col gap-2 px-3 pt-4">
            <div className="h-2 w-16 rounded-full bg-paper-ink/70" />
            <div className="h-1.5 w-12 rounded-full bg-paper-ink/45" />
            <div className="mt-1 space-y-1.5 opacity-60">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-px w-full border-b border-dashed border-paper-rule" />
              ))}
            </div>
          </div>
        </Page>
      ),
    },
    {
      key: 'rubric',
      el: (
        <Page landscape>
          <div className="grid h-full grid-cols-5 grid-rows-4 gap-px p-2.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className={cn('rounded-[1px] border border-paper-ink/20', i < 5 && 'bg-paper-ink/10')} />
            ))}
          </div>
        </Page>
      ),
    },
  ];

  const fan = [
    { x: 0, y: 0, r: -6 },
    { x: 46, y: 14, r: -2 },
    { x: 92, y: 30, r: 2 },
    { x: 60, y: 168, r: 4 },
  ];

  return (
    <div className="relative mx-auto h-[340px] w-full max-w-[460px] select-none" aria-hidden>
      {/* Brief */}
      <div className="absolute left-0 top-4 aspect-[210/297] w-[42%] rounded-[3px] bg-paper p-4 shadow-lift ring-1 ring-black/5">
        <div className="flex flex-col gap-[7px]">
          {BRIEF.map((l, i) => (
            <Line key={i} w={l.w} kind={'kind' in l ? l.kind : undefined} lit={lit(i)} />
          ))}
        </div>
        <motion.div
          className="pointer-events-none absolute inset-x-2 h-6 rounded bg-gradient-to-b from-transparent via-warm/15 to-transparent"
          initial={false}
          animate={phase === 1 ? { top: ['4%', '86%'], opacity: [0, 1, 1, 0] } : { opacity: 0 }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />
        <span className="absolute -bottom-6 left-0 text-xs text-muted-foreground">brief.pdf</span>
      </div>

      {/* Arrow */}
      <svg className="absolute left-[42.5%] top-[42%] h-6 w-9 text-warm" viewBox="0 0 40 24" fill="none">
        <path
          d="M2 12h32m0 0-8-8m8 8-8 8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          style={{ strokeDashoffset: phase >= 1 ? 0 : 0.85, opacity: phase >= 1 ? 1 : 0.35, transition: 'stroke-dashoffset 0.6s ease, opacity 0.6s ease' }}
        />
      </svg>

      {/* Template pages */}
      <div className="absolute right-0 top-0 h-full w-[50%]">
        <AnimatePresence>
          {showPages &&
            pages.map((p, i) => (
              <motion.div
                key={p.key}
                className="absolute"
                initial={{ opacity: 0, x: -60, y: 60, rotate: 0, scale: 0.85 }}
                animate={{ opacity: 1, x: fan[i]!.x, y: fan[i]!.y, rotate: fan[i]!.r, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.3 } }}
                transition={{ delay: reduce ? 0 : i * 0.18, type: 'spring', stiffness: 160, damping: 20 }}
              >
                <div className="relative">{p.el}</div>
              </motion.div>
            ))}
        </AnimatePresence>
        {showPages && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="absolute bottom-0 right-0 text-xs text-muted-foreground"
          >
            Report_Template.docx
          </motion.span>
        )}
      </div>
    </div>
  );
}
