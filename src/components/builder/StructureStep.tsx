import { useEffect, useMemo, useRef, useState } from 'react';
import {
  closestCenter,
  DndContext,
  TouchSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,

} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, ArrowRight, GripVertical, IndentDecrease, IndentIncrease, Plus, Quote, ScrollText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Switch, Label, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';
import { useBuilder } from '@/store/builder';
import { LOW_CONFIDENCE, type Heading } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StepHeader, useFocusFlash } from './shared';

function ConfidenceChip({ h }: { h: Heading }) {
  if (h.origin === 'user') return <Badge variant="outline">added</Badge>;
  const pct = Math.round(h.confidence * 100);
  const label = h.confidence < LOW_CONFIDENCE ? 'Review' : `${pct}%`;
  const variant = h.confidence < LOW_CONFIDENCE ? 'warning' : h.confidence >= 0.85 ? 'success' : 'info';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="rounded-full">
          <Badge variant={variant}>{label}</Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {h.confidence < LOW_CONFIDENCE
          ? `Detected with ${pct}% confidence – check this is really a heading.`
          : `Detected with ${pct}% confidence.`}
      </TooltipContent>
    </Tooltip>
  );
}

function Row({
  h,
  index,
  total,
  showSource,
  selected,
  onSelectSource,
  onMove,
}: {
  h: Heading;
  index: number;
  total: number;
  showSource: boolean;
  selected: boolean;
  onSelectSource: () => void;
  onMove: (from: number, to: number) => void;
}) {
  const { updateHeading, indent, outdent, removeHeading } = useBuilder();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: h.id });
  // Keyboard reordering: ↑/↓ on the focused handle moves the heading one place (focus stays on it).
  const onHandleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && index > 0) {
      e.preventDefault();
      onMove(index, index - 1);
    } else if (e.key === 'ArrowDown' && index < total - 1) {
      e.preventDefault();
      onMove(index, index + 1);
    }
  };
  const flashRef = useFocusFlash<HTMLDivElement>({ kind: 'heading', id: h.id });
  const low = h.origin === 'detected' && h.confidence < LOW_CONFIDENCE;
  return (
    // dnd-kit owns this element's transform; a CSS fade-in keeps new rows from popping in.
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative list-none animate-in fade-in-0 slide-in-from-top-1 duration-200', isDragging && 'z-10')}
    >
      <div
        ref={flashRef}
        className={cn(
          'group flex items-center gap-1.5 rounded-md border bg-card py-1.5 pl-1 pr-2 transition-shadow',
          h.level === 2 && 'ml-8',
          low && 'border-warning/50 bg-warning-soft/50',
          isDragging && 'shadow-lift ring-1 ring-ring',
          selected && 'ring-1 ring-warm',
        )}
      >
        <button
          type="button"
          className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Move "${h.text}", position ${index + 1} of ${total}. Use the up and down arrow keys.`}
          {...attributes}
          aria-roledescription="reorder handle"
          {...listeners}
          onKeyDown={onHandleKey}
        >
          <GripVertical className="size-4" />
        </button>
        <span className={cn('w-7 shrink-0 text-center font-mono text-[11px] font-semibold', h.level === 1 ? 'text-foreground' : 'text-muted-foreground')}>H{h.level}</span>
        <label htmlFor={`h-${h.id}`} className="sr-only">
          Heading {index + 1} text
        </label>
        <input
          id={`h-${h.id}`}
          value={h.text}
          onChange={(e) => updateHeading(h.id, { text: e.target.value })}
          className={cn(
            'min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm hover:border-input focus:border-input focus:bg-background focus:outline-none',
            h.level === 1 && 'font-semibold',
          )}
        />
        <ConfidenceChip h={h} />
        <div className="flex items-center">
          {showSource && h.source && (
            <Button variant="ghost" size="icon-sm" onClick={onSelectSource} aria-label={`Show where "${h.text}" is in the brief`}>
              <Quote />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => outdent(h.id)} disabled={h.level === 1} aria-label="Make main heading (H1)">
                <IndentDecrease />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Make it a part (H1)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => indent(h.id)} disabled={h.level === 2 || index === 0} aria-label="Make sub-heading (H2)">
                <IndentIncrease />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Make it a sub-task (H2)</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="icon-sm" onClick={() => removeHeading(h.id)} aria-label={`Delete "${h.text}"`} className="hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  );
}

function SourcePanel({ selectedIndex }: { selectedIndex?: number }) {
  const brief = useBuilder((s) => s.brief);
  const headings = useBuilder((s) => s.config?.headings ?? []);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceIdx = useMemo(() => new Set(headings.map((h) => h.source?.index).filter((x): x is number => x !== undefined)), [headings]);
  useEffect(() => {
    if (selectedIndex === undefined) return;
    containerRef.current?.querySelector(`[data-line="${selectedIndex}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedIndex]);
  if (!brief) return null;
  let lastPage: number | undefined;
  return (
    <div ref={containerRef} className="scrollbar-thin max-h-[45vh] overflow-auto rounded-lg border bg-paper p-4 2xl:max-h-[70vh] font-mono text-[12px] leading-relaxed text-paper-ink" aria-label="Brief text">
      {brief.lines
        .filter((l) => !l.repeated)
        .map((l) => {
          const pageMark = l.page !== undefined && l.page !== lastPage;
          lastPage = l.page;
          return (
            <div key={l.index}>
              {pageMark && <div className="my-2 border-t border-dashed border-paper-rule pt-1 text-[10px] text-paper-ink/50">page {l.page}</div>}
              <p
                data-line={l.index}
                className={cn(
                  'rounded px-1',
                  sourceIdx.has(l.index) && 'bg-warm/15',
                  selectedIndex === l.index && 'bg-warm/35 ring-1 ring-warm',
                  l.bold && 'font-semibold',
                )}
              >
                {l.text}
              </p>
            </div>
          );
        })}
    </div>
  );
}

export function StructureStep() {
  const { config, moveHeading, addHeading, setStep, brief } = useBuilder();
  const [showSource, setShowSource] = useState(false);
  const [selected, setSelected] = useState<string>();
  const listRef = useFocusFlash<HTMLDivElement>({ kind: 'toc' });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }));
  const [announce, setAnnounce] = useState('');
  const headings = config?.headings ?? [];
  const lowCount = headings.filter((h) => h.origin === 'detected' && h.confidence < LOW_CONFIDENCE).length;
  const textOf = (id: unknown) => headings.find((h) => h.id === id)?.text ?? 'heading';
  const announcements = {
    onDragStart: ({ active }: { active: { id: unknown } }) => `Picked up "${textOf(active.id)}".`,
    onDragOver: () => undefined,
    onDragEnd: ({ active }: { active: { id: unknown } }) => `Dropped "${textOf(active.id)}".`,
    onDragCancel: ({ active }: { active: { id: unknown } }) => `Cancelled moving "${textOf(active.id)}".`,
  };
  const keyMove = (from: number, to: number) => {
    moveHeading(from, to);
    setAnnounce(`Moved "${headings[from]?.text}" to position ${to + 1} of ${headings.length}.`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = headings.findIndex((h) => h.id === e.active.id);
    const to = headings.findIndex((h) => h.id === e.over!.id);
    moveHeading(from, to);
  };

  const selectedSource = headings.find((h) => h.id === selected)?.source?.index;

  return (
    <div>
      <StepHeader
        step={2}
        title="Check the structure"
        description="Each part becomes a page-starting heading; sub-tasks sit under it. Drag to reorder, rename inline, or change the level."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {lowCount > 0 && (
          <Badge variant="warning" className="text-xs">
            {lowCount} heading{lowCount > 1 ? 's' : ''} to review
          </Badge>
        )}
        {brief && (
          <div className="ml-auto flex items-center gap-2">
            <Switch id="show-source" checked={showSource} onCheckedChange={setShowSource} />
            <Label htmlFor="show-source" className="inline-flex items-center gap-1.5">
              <ScrollText className="size-4 text-muted-foreground" aria-hidden /> Show source
            </Label>
          </div>
        )}
      </div>

      <div className={cn('grid grid-cols-1 gap-4', showSource && '2xl:grid-cols-2')}>
        <div ref={listRef} className="min-w-0 rounded-lg">
          <p className="sr-only" aria-live="assertive">{announce}</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
            <SortableContext items={headings.map((h) => h.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5" aria-label="Report headings">
                  {headings.map((h, i) => (
                    <Row
                      key={h.id}
                      h={h}
                      index={i}
                      showSource={showSource}
                      selected={showSource && selected === h.id}
                      onSelectSource={() => setSelected(h.id)}
                      total={headings.length}
                      onMove={keyMove}
                    />
                  ))}
              </ul>
            </SortableContext>
          </DndContext>
          {headings.length === 0 && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No headings yet. Add the parts of your report.</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => addHeading(1)}>
              <Plus /> Add part
            </Button>
            <Button variant="outline" size="sm" onClick={() => addHeading(2)} disabled={headings.length === 0}>
              <Plus /> Add sub-task
            </Button>
          </div>
        </div>
        {showSource && <SourcePanel selectedIndex={selectedSource} />}
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => setStep(0)}>
          <ArrowLeft /> Back
        </Button>
        <Button size="lg" onClick={() => setStep(2)}>
          Next: format & cover <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
