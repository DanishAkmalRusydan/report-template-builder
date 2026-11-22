import { useId, useRef, useState, type ReactNode } from 'react';
import { FileText, FileType2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatBytes } from '@/lib/utils';

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const pdf = /\.pdf$/i.test(name);
  return (
    <span
      className={cn(
        'relative flex size-11 shrink-0 items-center justify-center rounded-md border',
        pdf ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-info/25 bg-info-soft text-info',
        className,
      )}
      aria-hidden
    >
      {pdf ? <FileType2 className="size-5" /> : <FileText className="size-5" />}
      <span className="absolute -bottom-1.5 rounded-sm bg-card px-1 text-[9px] font-bold uppercase leading-3 ring-1 ring-border">{pdf ? 'pdf' : 'docx'}</span>
    </span>
  );
}

interface DropzoneProps {
  label: string;
  hint: ReactNode;
  accept: string;
  file?: { name: string; size: number };
  busy?: boolean;
  onFile: (f: File) => void;
  onClear?: () => void;
  footer?: ReactNode;
  size?: 'lg' | 'md';
}

export function Dropzone({ label, hint, accept, file, busy, onFile, onClear, footer, size = 'lg' }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  const pick = () => inputRef.current?.click();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  if (file && !busy) {
    return (
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <FileIcon name={file.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {label}
            {file.size ? ` · ${formatBytes(file.size)}` : ''}
          </p>
          {footer}
        </div>
        <Button variant="outline" size="sm" onClick={pick}>
          Replace
        </Button>
        {onClear && (
          <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label={`Remove ${label.toLowerCase()}`}>
            <X />
          </Button>
        )}
        <input ref={inputRef} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={cn(
        'group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed bg-card text-center transition-colors',
        size === 'lg' ? 'min-h-56 p-8' : 'min-h-36 p-6',
        over ? 'border-warm bg-warm-soft/60' : 'border-input hover:border-primary/40',
      )}
    >
      <span className={cn('mb-3 flex size-12 items-center justify-center rounded-full bg-secondary transition-transform', over && 'scale-110')}>
        <Upload className="size-5 text-muted-foreground" aria-hidden />
      </span>
      <p className="font-medium">
        <label htmlFor={id} className="cursor-pointer">
          {over ? 'Drop to add' : label}
        </label>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={pick} disabled={busy}>
        Choose file
      </Button>
      <input
        id={id}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
