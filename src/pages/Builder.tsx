import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Eye, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/primitives';
import { LivePreview } from '@/components/preview/LivePreview';
import { UploadStep } from '@/components/builder/UploadStep';
import { StructureStep } from '@/components/builder/StructureStep';
import { FormatStep } from '@/components/builder/FormatStep';
import { ReviewStep, useIssues } from '@/components/builder/ReviewStep';
import { useBriefLoader } from '@/components/builder/useBriefLoader';
import { STEPS, useBuilder, type Step } from '@/store/builder';
import { cn } from '@/lib/utils';

function StepRail({ compact }: { compact?: boolean }) {
  const { step, setStep, config } = useBuilder();
  const { issues } = useIssues();
  const warnings = issues.filter((i) => i.severity === 'warning').length;
  const pct = (step / (STEPS.length - 1)) * 100;

  if (compact) {
    return (
      <nav aria-label="Builder steps" className="mb-6">
        <ol className="flex items-center gap-1">
          {STEPS.map((label, i) => (
            <li key={label} className="flex flex-1 flex-col gap-1.5">
              <button
                type="button"
                disabled={!config && i > 0}
                onClick={() => setStep(i as Step)}
                aria-current={step === i ? 'step' : undefined}
                className={cn('h-1.5 rounded-full transition-colors disabled:cursor-not-allowed', i <= step ? 'bg-warm' : 'bg-secondary')}
                aria-label={`Step ${i + 1}: ${label}`}
              />
              <span className={cn('hidden text-[11px] sm:block', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Builder steps" className="relative">
      <div className="absolute bottom-4 left-[15px] top-4 w-0.5 rounded-full bg-secondary" aria-hidden>
        <motion.div className="w-full rounded-full bg-warm" initial={false} animate={{ height: `${pct}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
      <ol className="relative space-y-6">
        {STEPS.map((label, i) => {
          const done = i < step;
          const current = i === step;
          const disabled = !config && i > 0;
          return (
            <li key={label}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setStep(i as Step)}
                aria-current={current ? 'step' : undefined}
                className="group flex w-full items-center gap-3 rounded-md text-left disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background text-xs font-semibold transition-colors',
                    current && 'border-warm text-warm',
                    done && 'border-warm bg-warm text-warm-foreground',
                    !current && !done && 'border-border text-muted-foreground group-hover:border-primary/40',
                  )}
                >
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-sm', current ? 'font-semibold' : 'text-muted-foreground group-hover:text-foreground')}>{label}</span>
                  {i === 3 && config && warnings > 0 && (
                    <Badge variant="warning" className="mt-1">
                      {warnings} warning{warnings > 1 ? 's' : ''}
                    </Badge>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StartOver() {
  const [open, setOpen] = useState(false);
  const reset = useBuilder((s) => s.reset);
  const config = useBuilder((s) => s.config);
  if (!config) return null;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <RotateCcw /> Start over
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Start over?</DialogTitle>
          <DialogDescription>This clears the current brief and settings. Templates you downloaded stay in History.</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Start over
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Builder() {
  const step = useBuilder((s) => s.step);
  const config = useBuilder((s) => s.config);
  const loader = useBriefLoader();
  const [params, setParams] = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const exampleStarted = useRef(false);

  useEffect(() => {
    if (params.get('example') && !exampleStarted.current) {
      exampleStarted.current = true;
      setParams({}, { replace: true });
      void loader.loadExample();
    }
  }, [params, setParams, loader]);

  // New step: start at its top.
  useEffect(() => {
    mainRef.current?.scrollIntoView({ block: 'start' });
    window.scrollTo({ top: 0 });
  }, [step]);

  const steps = [<UploadStep key="0" loader={loader} />, <StructureStep key="1" />, <FormatStep key="2" />, <ReviewStep key="3" />];

  return (
    <div className="mx-auto grid max-w-[1440px] gap-8 px-4 pb-24 pt-6 lg:grid-cols-[190px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_340px] 2xl:grid-cols-[220px_minmax(0,1fr)_380px]">
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-8">
          <StepRail />
          <StartOver />
        </div>
      </aside>

      <div ref={mainRef} className="min-w-0 scroll-mt-20">
        <div className="lg:hidden">
          <StepRail compact />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
            {steps[step]}
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 lg:hidden">
          <StartOver />
        </div>
      </div>

      <aside className="hidden xl:block" aria-label="Live preview">
        <div className="sticky top-20">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-sans text-sm font-semibold tracking-normal">Live preview</h2>
            <span className="text-xs text-muted-foreground">Click a page to edit it</span>
          </div>
          <div className="scrollbar-thin -mx-2 max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-lg bg-secondary/60 px-2 py-5">
            <LivePreview />
          </div>
        </div>
      </aside>

      {config && (
        <>
          <Button onClick={() => setSheet(true)} className="fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full shadow-lift xl:hidden" size="lg">
            <Eye /> Preview
          </Button>
          <Dialog open={sheet} onOpenChange={setSheet}>
            <SheetContent aria-describedby={undefined}>
              <DialogTitle className="px-5 pb-2 pt-3 font-sans text-base font-semibold">Live preview</DialogTitle>
              <div className="overflow-y-auto bg-secondary/60 px-4 py-5">
                <LivePreview onNavigate={() => setSheet(false)} />
              </div>
            </SheetContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
