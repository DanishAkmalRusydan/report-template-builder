import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardPaste, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Progress } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useBuilder } from '@/store/builder';
import { Dropzone } from './Dropzone';
import { cn, countHeadings } from '@/lib/utils';
import { StepHeader, useFocusFlash } from './shared';
import type { LoadStage, useBriefLoader } from './useBriefLoader';

const STAGES: { key: LoadStage; label: string }[] = [
  { key: 'reading', label: 'Reading the file' },
  { key: 'detecting', label: 'Finding headings, format rules and the rubric' },
  { key: 'done', label: 'Ready' },
];

function ParseProgress({ stage }: { stage: LoadStage }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <div className="rounded-lg border bg-card p-5" role="status" aria-live="polite">
      <Progress value={((idx + 1) / STAGES.length) * 100} label="Parsing progress" />
      <ul className="mt-4 space-y-2 text-sm">
        {STAGES.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            {i < idx ? (
              <Check className="size-4 text-success" aria-hidden />
            ) : i === idx ? (
              <Loader2 className="size-4 animate-spin text-warm" aria-hidden />
            ) : (
              <span className="size-4 rounded-full border" aria-hidden />
            )}
            <span className={i > idx ? 'text-muted-foreground' : ''}>{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasteDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (t: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Paste the brief text</DialogTitle>
        <DialogDescription>
          Scanned PDFs have no text to read. Copy the text from the brief (or from an OCR tool) and paste it here. Put each heading on its
          own line.
        </DialogDescription>
        <label htmlFor="paste-brief" className="sr-only">
          Brief text
        </label>
        <textarea
          id="paste-brief"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={'PART A: INTRODUCTION\nTask A1: Background\n…\nFont: Times New Roman 12, line spacing 1.5'}
          className="w-full resize-y rounded-md border border-input bg-card p-3 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              void onSubmit(text).then((ok) => ok && onOpenChange(false));
            }}
          >
            Use this text
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function rubricPagesLabel(pages: number[]): string {
  if (pages.length === 0) return '';
  if (pages.length === 1) return ` (page ${pages[0]})`;
  return ` (pages ${pages[0]}–${pages[pages.length - 1]})`;
}

export function UploadStep({ loader }: { loader: ReturnType<typeof useBriefLoader> }) {
  const { briefFile, brief, rubricFile, rubricBytes, clearRubric, setStep, config } = useBuilder();
  const [pasteOpen, setPasteOpen] = useState(false);
  const busy = loader.stage === 'reading' || loader.stage === 'detecting';
  const rubricRef = useFocusFlash<HTMLDivElement>({ kind: 'rubric' });
  const pdfRubricInBrief = !!brief?.rubric.found;

  return (
    <div>
      <StepHeader
        step={1}
        title="Upload your brief"
        description="Add the assignment brief. A rubric or cover sheet inside the brief is used as it is; add the rubric separately if the brief doesn't include it."
      />

      <div className="mb-5 flex items-center gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
        Files are read in this browser tab and are never uploaded.
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="wait" initial={false}>
          {busy ? (
            <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ParseProgress stage={loader.stage} />
            </motion.div>
          ) : (
            <motion.div key="zone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Dropzone
                label="Assignment brief"
                hint={
                  <>
                    Drag and drop a <span className="font-medium text-foreground">.docx</span> or{' '}
                    <span className="font-medium text-foreground">.pdf</span>, or choose a file
                  </>
                }
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                file={briefFile}
                onFile={loader.loadBriefFile}
                footer={
                  brief && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{countHeadings(brief.headings).parts} parts</Badge>
                      {brief.headings.some((h) => h.level === 2) && (
                        <Badge>{brief.headings.filter((h) => h.level === 2).length} sub-tasks</Badge>
                      )}
                      {brief.format.font && (
                        <Badge>
                          {brief.format.font.value}
                          {brief.format.fontSizePt ? ` ${brief.format.fontSizePt.value}` : ''}
                        </Badge>
                      )}
                      {brief.cover.briefHasCover && <Badge variant="info">has its own cover</Badge>}
                      {brief.rubric.found && <Badge variant="info">rubric inside</Badge>}
                    </div>
                  )
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

        {!briefFile && !busy && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Button variant="secondary" onClick={loader.loadExample}>
              <Sparkles /> Try an example
            </Button>
            <Button variant="ghost" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste /> Paste text instead
            </Button>
          </div>
        )}

        {loader.noText && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-sm"
            role="alert"
          >
            <span className="flex-1">This PDF has no text layer (it is probably a scan). Paste the brief text instead.</span>
            <Button size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste /> Paste text
            </Button>
          </div>
        )}

        <div ref={rubricRef} className="rounded-lg">
          <h2 className="mb-2 mt-8 font-sans text-sm font-semibold tracking-normal">
            Rubric{' '}
            <span className="font-normal text-muted-foreground">
              {brief?.rubric.found ? '(found in the brief)' : brief ? '(add it here)' : '(optional)'}
            </span>
          </h2>
          {brief && !rubricFile && (
            <div
              data-testid="rubric-status"
              className={cn(
                'mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                brief.rubric.found ? 'border-success/30 bg-success/5' : 'border-warning/40 bg-warning-soft',
              )}
              role={brief.rubric.found ? undefined : 'alert'}
            >
              {brief.rubric.found ? (
                <>
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  <span>
                    The brief has a rubric{rubricPagesLabel(brief.rubric.pages)}. It goes on the last pages of the template. Add a file
                    below only if you have a different rubric.
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                  <span>
                    No rubric was found in the brief. Add the rubric file below (.docx or .pdf) so it goes on the last pages of the
                    template.
                  </span>
                </>
              )}
            </div>
          )}
          <Dropzone
            size="md"
            label="Rubric file (.docx or .pdf)"
            hint={
              rubricFile && pdfRubricInBrief
                ? 'This file is used instead of the rubric in the brief.'
                : 'A .docx is copied in unchanged; a .pdf is rebuilt as a Word table.'
            }
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            file={rubricFile}
            onFile={loader.loadRubricFile}
            onClear={clearRubric}
            footer={
              rubricFile && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{rubricFile.landscape ? 'Landscape' : 'Portrait'}</Badge>
                  {rubricFile.pages > 0 && (
                    <Badge>
                      {rubricFile.pages} page{rubricFile.pages === 1 ? '' : 's'}
                    </Badge>
                  )}
                  {rubricFile.format === 'pdf' && <Badge variant="info">rebuilt as a table</Badge>}
                  {pdfRubricInBrief && <Badge variant="info">replaces the brief’s rubric</Badge>}
                </div>
              )
            }
          />
          {config?.rubric.kind === 'docx' && !rubricBytes && (
            <p className="mt-2 text-sm text-warning">Re-add the rubric file – files are not kept after the page is reloaded.</p>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button size="lg" disabled={!config || busy} onClick={() => setStep(1)}>
          Next: structure <ArrowRight />
        </Button>
      </div>

      <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} onSubmit={loader.loadPastedText} />
    </div>
  );
}
