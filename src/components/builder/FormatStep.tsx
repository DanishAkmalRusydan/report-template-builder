import { useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Label, Slider, Switch } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useBuilder } from '@/store/builder';
import { activePreset, usePresets } from '@/store/presets';
import type { PageNumberPosition, SourceRef } from '@/lib/types';
import { cn } from '@/lib/utils';
import { FromBrief, Section, StepHeader, useFocusFlash } from './shared';

const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Verdana', 'Garamond'];
const SIZES = [10, 10.5, 11, 12, 13, 14];
const SPACINGS = [1, 1.15, 1.5, 2];
const PAGE_NUMBERS: { v: PageNumberPosition; label: string }[] = [
  { v: 'bottom-right', label: 'Bottom right' },
  { v: 'bottom-center', label: 'Bottom centre' },
  { v: 'bottom-left', label: 'Bottom left' },
  { v: 'top-right', label: 'Top right' },
  { v: 'none', label: 'No page numbers' },
];
const COVER_COLOURS = [
  { name: 'White', hex: undefined },
  { name: 'Light blue', hex: 'DCEBF7' },
  { name: 'Light green', hex: 'E2EFDA' },
  { name: 'Light yellow', hex: 'FFF2CC' },
  { name: 'Light pink', hex: 'FCE4EC' },
  { name: 'Light purple', hex: 'E4DFEC' },
  { name: 'Light grey', hex: 'EDEDED' },
];

function Field({ id, label, tag, children, className }: { id: string; label: string; tag?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex min-h-5 items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {tag}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ id, label, description, checked, onChange, tag }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; tag?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{label}</Label>
          {tag}
        </div>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function tagFor<T>(detected: { value: T; source?: SourceRef } | undefined, current: T) {
  if (!detected?.source) return undefined;
  return <FromBrief source={detected.source} matches={detected.value === current} />;
}

async function readLogo(file: File): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  if (!/^image\/(png|jpe?g)$/.test(file.type)) throw new Error('Use a PNG or JPG image for the logo.');
  if (file.size > 3 * 1024 * 1024) throw new Error('The logo is larger than 3 MB. Use a smaller image.');
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('The image could not be read.'));
    r.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  return { dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight };
}

function SavePresetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const config = useBuilder((s) => s.config);
  const save = usePresets((s) => s.save);
  const [name, setName] = useState(config?.cover.universityName || '');
  if (!config) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Save university profile</DialogTitle>
        <DialogDescription>Saves the university name, logo, default formatting and cover layout in this browser, so you can pick them next time.</DialogDescription>
        <Field id="preset-name" label="Profile name">
          <Input id="preset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My University – IT faculty" autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              const { coverColourHex: _c, ...format } = config.format;
              save({
                name: name.trim(),
                universityName: config.cover.universityName,
                ...(config.cover.logo ? { logo: config.cover.logo } : {}),
                format,
                cover: { showPictureColumn: config.cover.showPictureColumn, memberRows: config.cover.memberRows },
              });
              toast.success(`Saved profile “${name.trim()}”.`);
              onOpenChange(false);
            }}
          >
            <Save /> Save profile
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FormatStep() {
  const { config, brief, patchFormat, patchCover, patchConfig, applyPreset, setStep } = useBuilder();
  const presets = usePresets();
  const current = activePreset(presets);
  const [saveOpen, setSaveOpen] = useState(false);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverRef = useFocusFlash<HTMLDivElement>({ kind: 'cover' });
  const formatRef = useFocusFlash<HTMLDivElement>({ kind: 'format' });
  if (!config) return null;
  const f = config.format;
  const c = config.cover;
  const bf = brief?.format;
  const bc = brief?.cover;
  const coverWanted = bf?.coverColour;

  return (
    <div>
      <StepHeader step={3} title="Format & cover" description="Values tagged “from brief” were read from the brief. Hover a tag to see the exact line." />

      <div className="space-y-5">
        <Section
          title="University profile"
          description="Your university's name, logo and usual formatting. The brief's own rules always win."
          action={
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)}>
              <Save /> Save as profile
            </Button>
          }
        >
          <Select
            value={current.id}
            onValueChange={(id) => {
              presets.setActive(id);
              const p = presets.presets.find((x) => x.id === id);
              if (p) {
                applyPreset(p);
                toast.success(`Applied “${p.name}”.`);
              }
            }}
          >
            <SelectTrigger aria-label="University profile" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>

        <div ref={formatRef} className="rounded-lg">
          <Section title="Document format">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="font" label="Font" tag={tagFor(bf?.font, f.font)}>
                <Select value={f.font} onValueChange={(v) => patchFormat({ font: v })}>
                  <SelectTrigger id="font">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([f.font, ...FONTS])].map((x) => (
                      <SelectItem key={x} value={x}>
                        <span style={{ fontFamily: x }}>{x}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="size" label="Font size" tag={tagFor(bf?.fontSizePt, f.fontSizePt)}>
                <Select value={String(f.fontSizePt)} onValueChange={(v) => patchFormat({ fontSizePt: Number(v) })}>
                  <SelectTrigger id="size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([f.fontSizePt, ...SIZES])].sort((a, b) => a - b).map((x) => (
                      <SelectItem key={x} value={String(x)}>
                        {x} pt
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="spacing" label="Line spacing" tag={tagFor(bf?.lineSpacing, f.lineSpacing)}>
                <Select value={String(f.lineSpacing)} onValueChange={(v) => patchFormat({ lineSpacing: Number(v) })}>
                  <SelectTrigger id="spacing">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([f.lineSpacing, ...SPACINGS])].sort((a, b) => a - b).map((x) => (
                      <SelectItem key={x} value={String(x)}>
                        {x === 1 ? 'Single (1.0)' : x === 2 ? 'Double (2.0)' : x}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="paper" label="Paper size" tag={tagFor(bf?.paper, f.paper)}>
                <Select value={f.paper} onValueChange={(v) => patchFormat({ paper: v as 'A4' | 'Letter' })}>
                  <SelectTrigger id="paper">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">US Letter</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="pagenum" label="Page numbers" tag={tagFor(bf?.pageNumber, f.pageNumber)} className="sm:col-span-2">
                <Select value={f.pageNumber} onValueChange={(v) => patchFormat({ pageNumber: v as PageNumberPosition })}>
                  <SelectTrigger id="pagenum" className="sm:max-w-[calc(50%-0.5rem)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_NUMBERS.map((p) => (
                      <SelectItem key={p.v} value={p.v}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="mt-4 divide-y border-t pt-2">
              <ToggleRow id="justified" label="Justified text" checked={f.justified} onChange={(v) => patchFormat({ justified: v })} tag={tagFor(bf?.justified, f.justified)} />
              <ToggleRow
                id="one-part"
                label="One part per page"
                description="Every main heading starts on a new page."
                checked={config.onePartPerPage}
                onChange={(v) => patchConfig({ onePartPerPage: v })}
              />
              <ToggleRow
                id="refs"
                label="References heading"
                description={brief?.wantsReferences ? 'The brief asks for references.' : 'Adds a References heading at the end.'}
                checked={config.includeReferences}
                onChange={(v) => patchConfig({ includeReferences: v })}
              />
            </div>
          </Section>
        </div>

        <div ref={coverRef} className="rounded-lg">
          <Section
            title="Cover page"
            description={bc?.briefHasCover ? 'The brief has its own cover sheet. It is rebuilt from the brief’s fields.' : 'Generated from the details below. The cover has no page number.'}
          >
            {bc?.briefHasCover && (
              <div className="mb-4 inline-flex rounded-md border p-0.5" role="radiogroup" aria-label="Cover style">
                {(['from-brief', 'generated'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={c.mode === m}
                    onClick={() => patchCover({ mode: m })}
                    className={cn('rounded px-3 py-1.5 text-sm', c.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {m === 'from-brief' ? 'Brief’s cover sheet' : 'Generated cover'}
                  </button>
                ))}
              </div>
            )}

            <fieldset className="mb-5">
              <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
                Cover colour {coverWanted?.source && <FromBrief source={coverWanted.source} matches={f.coverColourHex === coverWanted.value.hex} />}
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                {COVER_COLOURS.map((col) => {
                  const active = (f.coverColourHex ?? undefined) === col.hex;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      onClick={() => patchFormat({ coverColourHex: col.hex })}
                      aria-label={col.name}
                      aria-pressed={active}
                      title={col.name}
                      className={cn('relative size-8 rounded-full border-2 transition-transform hover:scale-105', active ? 'border-primary' : 'border-border')}
                      style={{ background: col.hex ? `#${col.hex}` : '#ffffff' }}
                    >
                      {active && <Check className="absolute inset-0 m-auto size-4 text-[#14254a]" aria-hidden />}
                    </button>
                  );
                })}
                <label className="ml-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  Custom
                  <input
                    type="color"
                    value={`#${f.coverColourHex ?? 'FFFFFF'}`}
                    onChange={(e) => patchFormat({ coverColourHex: e.target.value.slice(1).toUpperCase() })}
                    className="h-8 w-10 cursor-pointer rounded border bg-transparent"
                    aria-label="Custom cover colour"
                  />
                </label>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="uni" label="University name">
                <Input id="uni" value={c.universityName} onChange={(e) => patchCover({ universityName: e.target.value })} />
              </Field>
              <Field id="logo" label="Logo">
                <div className="flex items-center gap-3">
                  {c.logo ? (
                    <img src={c.logo.dataUrl} alt="University logo" className="h-10 max-w-[120px] rounded border bg-white object-contain p-1" />
                  ) : (
                    <span className="flex h-10 w-16 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">none</span>
                  )}
                  <Button id="logo" variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
                    <ImagePlus /> {c.logo ? 'Change' : 'Upload'}
                  </Button>
                  {c.logo && (
                    <Button variant="ghost" size="icon-sm" onClick={() => patchCover({ logo: undefined })} aria-label="Remove logo">
                      <X />
                    </Button>
                  )}
                  <input
                    ref={logoInput}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="sr-only"
                    tabIndex={-1}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      try {
                        patchCover({ logo: await readLogo(file) });
                      } catch (err) {
                        toast.error((err as Error).message);
                      }
                    }}
                  />
                </div>
              </Field>
              <Field id="code" label="Subject code" tag={tagFor(bc?.subjectCode, c.subjectCode)}>
                <Input id="code" value={c.subjectCode} onChange={(e) => patchCover({ subjectCode: e.target.value })} />
              </Field>
              <Field id="subject" label="Subject name" tag={tagFor(bc?.subjectName, c.subjectName)}>
                <Input id="subject" value={c.subjectName} onChange={(e) => patchCover({ subjectName: e.target.value })} />
              </Field>
              <Field id="assignment" label="Assignment" tag={tagFor(bc?.assignmentName, c.assignmentName)}>
                <Input id="assignment" value={c.assignmentName} onChange={(e) => patchCover({ assignmentName: e.target.value })} />
              </Field>
              <Field id="lecturer" label="Lecturer" tag={tagFor(bc?.lecturer, c.lecturer)}>
                <Input id="lecturer" value={c.lecturer} onChange={(e) => patchCover({ lecturer: e.target.value })} placeholder="e.g. Dr. Name" />
              </Field>
              <Field id="title" label="Assignment title" tag={tagFor(bc?.assignmentTitle, c.assignmentTitle)} className="sm:col-span-2">
                <Input id="title" value={c.assignmentTitle} onChange={(e) => patchCover({ assignmentTitle: e.target.value })} />
              </Field>
            </div>

            {c.mode === 'from-brief' && c.briefFields.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium">Fields from the brief’s cover sheet</p>
                <div className="grid gap-2">
                  {c.briefFields.map((fld, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                      <Input
                        aria-label={`Field ${i + 1} label`}
                        value={fld.label}
                        onChange={(e) => patchCover({ briefFields: c.briefFields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                      />
                      <Input
                        aria-label={`${fld.label} value`}
                        value={fld.value}
                        placeholder="(left blank for you to fill)"
                        onChange={(e) => patchCover({ briefFields: c.briefFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 grid gap-5 border-t pt-5 sm:grid-cols-2">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="rows">Group member rows</Label>
                  <span className="font-mono text-sm tabular-nums" aria-live="polite">
                    {c.memberRows}
                  </span>
                </div>
                <Slider id="rows" min={1} max={8} step={1} value={[c.memberRows]} onValueChange={([v]) => patchCover({ memberRows: v ?? 1 })} thumbLabel="Group member rows" />
                {bc?.groupSize && (
                  <p className="text-xs text-muted-foreground">
                    The brief says groups of {bc.groupSize.min}
                    {bc.groupSize.max !== bc.groupSize.min ? `–${bc.groupSize.max}` : ''}.
                  </p>
                )}
              </div>
              <ToggleRow
                id="pictures"
                label="Picture column"
                description="A box for each member's photo."
                checked={c.showPictureColumn}
                onChange={(v) => patchCover({ showPictureColumn: v })}
              />
            </div>
          </Section>
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <Button variant="ghost" onClick={() => setStep(1)}>
          <ArrowLeft /> Back
        </Button>
        <Button size="lg" onClick={() => setStep(3)}>
          Next: review <ArrowRight />
        </Button>
      </div>
      <SavePresetDialog open={saveOpen} onOpenChange={setSaveOpen} />
    </div>
  );
}
