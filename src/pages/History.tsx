import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, FileText, History as HistoryIcon, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/primitives';
import { useHistory } from '@/store/history';
import { useBuilder } from '@/store/builder';
import { countHeadings } from '@/lib/utils';

const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default function History() {
  const { entries, duplicate, remove } = useHistory();
  const loadConfig = useBuilder((s) => s.loadConfig);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-3xl font-medium">History</h1>
      <p className="mt-2 text-muted-foreground">Templates you built before. Only the settings are saved here, in this browser – never your files.</p>

      {entries.length === 0 ? (
        <Card className="mt-8 flex flex-col items-center gap-3 p-10 text-center">
          <HistoryIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No templates yet</p>
          <p className="text-sm text-muted-foreground">Each template you download appears here, so you can rebuild it later.</p>
          <Button className="mt-2" onClick={() => navigate('/build')}>
            Build a template
          </Button>
        </Card>
      ) : (
        <ul className="mt-8 space-y-3">
          <AnimatePresence initial={false}>
            {entries.map((e) => {
              const h1 = countHeadings(e.config.headings).parts;
              return (
                <motion.li key={e.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-info-soft text-info" aria-hidden>
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.fileName}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {fmtDate(e.savedAt)} · from {e.briefName}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge>
                          {h1} part{h1 === 1 ? '' : 's'}
                        </Badge>
                        <Badge>
                          {e.config.format.font} {e.config.format.fontSizePt}
                        </Badge>
                        {e.config.rubric.kind !== 'none' && <Badge variant="info">rubric{e.rubricName ? `: ${e.rubricName}` : ''}</Badge>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          loadConfig(e.config, e.briefName, e.rubricName);
                          if (e.config.rubric.kind === 'docx') toast.info('Add the rubric file again – files are not stored.');
                          navigate('/build');
                        }}
                      >
                        <RefreshCw /> Rebuild
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          duplicate(e.id);
                          toast.success('Duplicated.');
                        }}
                      >
                        <Copy /> Duplicate
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => remove(e.id)} aria-label={`Remove ${e.fileName} from history`} className="hover:text-destructive">
                        <Trash2 />
                      </Button>
                    </div>
                  </Card>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
