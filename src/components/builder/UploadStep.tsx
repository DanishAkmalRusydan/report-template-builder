import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, ClipboardPaste, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Progress } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useBuilder } from '@/store/builder';
import { Dropzone } from './Dropzone';
import { countHeadings } from '@/lib/utils';
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

function PasteDialog({ open, onOpenChange, onSubmit }: { open: boolean; onOpenChange: (o: boolean) => void; onSubmit: (t: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Paste the brief text</DialogTitle>
        <DialogDescription>
          Scanned PDFs have no text to read. Copy the text from the brief (or from an OCR tool) and paste it here. Put each heading on its own line.
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

export function UploadStep({ loader }: { loader: ReturnType<typeof useBriefLoader> }) {
  const { briefFile, brief, rubricFile, rubricBytes, clearRubric, setStep, config } = useBuilder();
  const [pasteOpen, setPasteOpen] = useState(false);
  const busy = loader.stage === 'reading' || loader.stage === 'detecting';
  const rubricRef = useFocusFlash<HTMLDivElement>({ kind: 'rubric' });
  const pdfRubric = brief?.rubric.found && !rubricFile;

  return (
    <div>
      <StepHeader
        step={1}
        title="Upload your brief"
        description="Add the assignment brief, and the rubric if your lecturer gave it as a separate Word file."
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
                    Drag and drop a <span className="font-medium text-foreground">.docx</span> or <span className="font-medium text-foreground">.pdf</span>, or choose a file
                  </>
                }
                accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                file={briefFile}
                onFile={loader.loadBriefFile}
                footer={
                  brief && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge>{countHeadings(brief.headings).parts} parts</Badge>
                      {brief.headings.some((h) => h.level === 2) && <Badge>{brief.headings.filter((h) => h.level === 2).length} sub-tasks</Badge>}
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
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-sm" role="alert">
            <span className="flex-1">This PDF has no text layer (it is probably a scan). Paste the brief text instead.</span>
            <Button size="sm" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste /> Paste text
            </Button>
          </div>
        )}

        <div ref={rubricRef} className="rounded-lg">
          <h2 className="mb-2 mt-8 font-sans text-sm font-semibold tracking-normal">
            Rubric <span className="font-normal text-muted-foreground">(optional)</span>
          </h2>
          <Dropzone
            size="md"
            label="Rubric (.docx)"
            hint={pdfRubric ? 'A rubric was found inside the brief. Add a .docx only if you have a separate one.' : 'It is copied into the last pages unchanged.'}
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            file={rubricFile}
            onFile={loader.loadRubricFile}
            onClear={clearRubric}
            footer={
              rubricFile && (
                <div className="mt-2 flex gap-1.5">
                  <Badge>{rubricFile.landscape ? 'Landscape' : 'Portrait'}</Badge>
                  {rubricFile.pages > 0 && (
                    <Badge>
                      {rubricFile.pages} page{rubricFile.pages === 1 ? '' : 's'}
                    </Badge>
                  )}
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
