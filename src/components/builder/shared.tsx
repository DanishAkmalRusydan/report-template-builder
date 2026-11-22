import { useEffect, useRef, type ReactNode } from 'react';
import { Quote } from 'lucide-react';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';
import type { SourceRef } from '@/lib/types';
import { useBuilder, type FocusTarget } from '@/store/builder';
import { cn } from '@/lib/utils';

/** "from brief" tag with a tooltip quoting the source line. */
export function FromBrief({ source, matches = true }: { source?: SourceRef; matches?: boolean }) {
  if (!source) return null;
  if (!matches) {
    return (
      <Badge variant="outline" className="font-normal">
        changed
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded-full" aria-label={`From the brief: ${source.line}`}>
          <Badge variant="warm" className="cursor-help">
            from brief
          </Badge>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-sm">
        <p className="flex gap-2">
          <Quote className="mt-0.5 size-3 shrink-0 text-warm" aria-hidden />
          <span>
            <span className="italic">{source.line}</span>
            {source.page ? <span className="ml-1 text-muted-foreground">(page {source.page})</span> : null}
          </span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

const sameTarget = (a: FocusTarget, b: FocusTarget) => a.kind === b.kind && (a.kind !== 'heading' || (b.kind === 'heading' && a.id === b.id));

/** Scrolls an element into view and flashes it when the preview asks to focus it. */
export function useFocusFlash<T extends HTMLElement>(target: FocusTarget) {
  const ref = useRef<T>(null);
  const focus = useBuilder((s) => s.focus);
  useEffect(() => {
    if (!focus || !sameTarget(focus.target, target) || !ref.current) return;
    const el = ref.current;
    const t = setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('animate-flash');
      void el.offsetWidth;
      el.classList.add('animate-flash');
    }, 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);
  return ref;
}

export function Section({ title, description, children, className, action }: { title: string; description?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('rounded-lg border bg-card p-5', className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-sans text-sm font-semibold tracking-normal">{title}</h3>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StepHeader({ step, title, description }: { step: number; title: string; description: ReactNode }) {
  return (
    <header className="mb-6">
      <p className="text-sm font-medium text-warm">Step {step} of 4</p>
      <h1 className="mt-1 font-display text-3xl font-medium">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
    </header>
  );
}
