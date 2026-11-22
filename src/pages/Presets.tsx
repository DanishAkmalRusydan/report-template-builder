import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Check, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card, Input, Label, Switch } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { DEFAULT_PRESET, usePresets, type Preset } from '@/store/presets';
import type { PageNumberPosition } from '@/lib/types';

const FONTS = ['Times New Roman', 'Arial', 'Calibri', 'Cambria', 'Georgia'];

function Editor({ initial, onClose }: { initial: Preset; onClose: () => void }) {
  const save = usePresets((s) => s.save);
  const [p, setP] = useState<Preset>(initial);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Preset>) => setP((x) => ({ ...x, ...patch }));
  const setFmt = (patch: Partial<Preset['format']>) => setP((x) => ({ ...x, format: { ...x.format, ...patch } }));
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Profile name</Label>
          <Input id="p-name" value={p.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-uni">University name</Label>
          <Input id="p-uni" value={p.universityName} onChange={(e) => set({ universityName: e.target.value })} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        {p.logo ? <img src={p.logo.dataUrl} alt="Logo" className="h-12 max-w-[140px] rounded border bg-white object-contain p-1" /> : <span className="text-sm text-muted-foreground">No logo</span>}
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <ImagePlus /> {p.logo ? 'Change logo' : 'Add logo'}
        </Button>
        {p.logo && (
          <Button variant="ghost" size="sm" onClick={() => set({ logo: undefined })}>
            Remove
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          tabIndex={-1}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const dataUrl = await new Promise<string>((res) => {
              const r = new FileReader();
              r.onload = () => res(String(r.result));
              r.readAsDataURL(f);
            });
            const img = new Image();
            img.src = dataUrl;
            await img.decode();
            set({ logo: { dataUrl, widthPx: img.naturalWidth, heightPx: img.naturalHeight } });
          }}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="p-font">Default font</Label>
          <Select value={p.format.font ?? 'Times New Roman'} onValueChange={(v) => setFmt({ font: v })}>
            <SelectTrigger id="p-font">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONTS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-size">Size</Label>
          <Select value={String(p.format.fontSizePt ?? 12)} onValueChange={(v) => setFmt({ fontSizePt: Number(v) })}>
            <SelectTrigger id="p-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 11, 12, 13, 14].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s} pt
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-spacing">Spacing</Label>
          <Select value={String(p.format.lineSpacing ?? 1.5)} onValueChange={(v) => setFmt({ lineSpacing: Number(v) })}>
            <SelectTrigger id="p-spacing">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 1.15, 1.5, 2].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-pn">Page numbers</Label>
          <Select value={p.format.pageNumber ?? 'bottom-right'} onValueChange={(v) => setFmt({ pageNumber: v as PageNumberPosition })}>
            <SelectTrigger id="p-pn">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bottom-right">Bottom right</SelectItem>
              <SelectItem value="bottom-center">Bottom centre</SelectItem>
              <SelectItem value="bottom-left">Bottom left</SelectItem>
              <SelectItem value="top-right">Top right</SelectItem>
              <SelectItem value="none">None</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3 pb-2">
          <Switch id="p-just" checked={p.format.justified ?? true} onCheckedChange={(v) => setFmt({ justified: v })} />
          <Label htmlFor="p-just">Justified</Label>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="p-pic" checked={p.cover.showPictureColumn} onCheckedChange={(v) => set({ cover: { ...p.cover, showPictureColumn: v } })} />
        <Label htmlFor="p-pic">Picture column on the cover</Label>
      </div>
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!p.name.trim()}
          onClick={() => {
            save({ ...p, name: p.name.trim(), ...(p.builtIn ? { id: undefined } : {}) });
            toast.success(`Saved “${p.name.trim()}”.`);
            onClose();
          }}
        >
          <Check /> Save profile
        </Button>
      </div>
    </div>
  );
}

export default function Presets() {
  const { presets, activeId, setActive, remove } = usePresets();
  const [editing, setEditing] = useState<Preset | null>(null);
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="font-display text-3xl font-medium">University profiles</h1>
          <p className="mt-2 text-muted-foreground">Your university's name, logo and usual formatting, applied whenever a brief doesn't say otherwise.</p>
        </div>
        <Button onClick={() => setEditing({ ...DEFAULT_PRESET, id: '', name: '', builtIn: false })}>
          <Plus /> New profile
        </Button>
      </div>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {presets.map((p) => (
          <li key={p.id}>
            <Card className="flex h-full flex-col p-5">
              <div className="flex items-start gap-3">
                {p.logo ? (
                  <img src={p.logo.dataUrl} alt="" className="h-11 w-20 rounded border bg-white object-contain p-1" />
                ) : (
                  <span className="flex h-11 w-20 items-center justify-center rounded border bg-secondary" aria-hidden>
                    <Building2 className="size-5 text-muted-foreground" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{p.universityName || 'No university name'}</p>
                </div>
                {activeId === p.id && <Badge variant="success">in use</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge>
                  {p.format.font} {p.format.fontSizePt}
                </Badge>
                <Badge>spacing {p.format.lineSpacing}</Badge>
                {p.builtIn && <Badge variant="outline">built-in</Badge>}
              </div>
              <div className="mt-4 flex gap-2 pt-1">
                {activeId !== p.id && (
                  <Button size="sm" variant="secondary" onClick={() => setActive(p.id)}>
                    Use
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setEditing(p.builtIn ? { ...p, name: `${p.name} (copy)` } : p)}>
                  <Pencil /> {p.builtIn ? 'Customise' : 'Edit'}
                </Button>
                {!p.builtIn && (
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)} aria-label={`Delete profile ${p.name}`} className="ml-auto hover:text-destructive">
                    <Trash2 />
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>{editing?.id ? 'Edit profile' : 'New profile'}</DialogTitle>
          <DialogDescription>Saved in this browser only.</DialogDescription>
          {editing && <Editor initial={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
