import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, Info, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, Progress } from '@/components/ui/primitives';
import { detectIssues, estimatePages } from '@/lib/detect/issues';
import type { Issue, TemplateConfig } from '@/lib/types';
import { rubricPageCount, useBuilder } from '@/store/builder';
import { useHistory } from '@/store/history';
import { downloadBlob, cn, countHeadings } from '@/lib/utils';
import { Section, StepHeader } from './shared';

export function useIssues(): { issues: Issue[]; pages: number; maxPages?: number } {
  const { config, brief, rubricFile, rubricBytes } = useBuilder();
  return useMemo(() => {
    if (!config) return { issues: [], pages: 0 };
    const input = {
      headings: config.headings,
      format: brief?.format ?? {},
      cover: brief?.cover ?? { groupType: { value: 'unknown' as const }, briefHasCover: false, coverFields: [] },
      rubric: brief?.rubric ?? { found: false, pages: [], landscape: false, confidence: 0 },
      deliverables: brief?.deliverables ?? [],
      template: {
        ...(config.format.coverColourHex ? { coverColourHex: config.format.coverColourHex } : {}),
        onePartPerPage: config.onePartPerPage,
        includeRubric: config.rubric.kind !== 'none',
        rubricPages: rubricPageCount({ config, rubricFile }),
      },
    };
    const issues = detectIssues(input);
    if (config.rubric.kind === 'docx' && !rubricBytes) {
      issues.unshift({
        id: 'rubric-missing',
        severity: 'warning',
        message: 'The rubric file is no longer loaded (files are not kept after a reload).',
        fix: 'Add the rubric again in step 1, or the template will say “Attach the rubric here.”',
      });
    }
    if (config.rubric.kind === 'none') {
      issues.unshift({
        id: 'rubric-none',
        severity: 'warning',
        message: 'There is no rubric: none was found in the brief and no rubric file was added.',
        fix: 'Add the rubric (.docx or .pdf) in step 1 so it goes on the last pages.',
      });
    }
    // A copied cover sheet already has its own fields and member table.
    const copied = config.cover.mode === 'from-brief' && !!config.cover.briefLayout?.blocks.length;
    const empty = copied ? [] : (['subjectCode', 'assignmentName', 'lecturer'] as const).filter((k) => !config.cover[k].trim());
    if (empty.length) {
      const names = { subjectCode: 'subject code', assignmentName: 'assignment', lecturer: 'lecturer' };
      issues.push({
        id: 'cover-empty',
        severity: 'info',
        message: `The cover has no ${empty.map((k) => names[k]).join(', ')}.`,
        fix: 'Fill it in under Format & cover, or leave it to type in Word.',
      });
    }
    // The member table should fit the group size.
    const g = brief?.cover.groupSize;
    if (g && !copied && config.cover.memberRows < g.max) {
      issues.push({
        id: 'rows-short',
        severity: 'info',
        message: `The brief allows groups of up to ${g.max}, but the cover has ${config.cover.memberRows} member rows.`,
      });
    }
    issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1));
    return { issues, pages: estimatePages(input), ...(brief?.format.maxPages ? { maxPages: brief.format.maxPages.value } : {}) };
  }, [config, brief, rubricFile, rubricBytes]);
}

function IssueRow({ issue }: { issue: Issue }) {
  const warn = issue.severity === 'warning';
  return (
    <li className={cn('flex gap-3 rounded-md border p-3', warn ? 'border-warning/40 bg-warning-soft/60' : 'bg-card')}>
      {warn ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      ) : (
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex items-start gap-2">
          <p className="flex-1">{issue.message}</p>
          <Badge variant={warn ? 'warning' : 'info'}>{warn ? 'warning' : 'info'}</Badge>
        </div>
        {issue.fix && <p className="mt-1 text-muted-foreground">{issue.fix}</p>}
        {issue.source && (
          <p className="mt-1.5 truncate text-xs italic text-muted-foreground">
            “{issue.source.line}”{issue.source.page ? ` – page ${issue.source.page}` : ''}
          </p>
        )}
      </div>
    </li>
  );
}

export function ReviewStep() {
  const { config, briefFile, rubricFile, rubricBytes, setStep } = useBuilder();
  const addHistory = useHistory((s) => s.add);
  const { issues, pages, maxPages } = useIssues();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();
  if (!config) return null;

  const warnings = issues.filter((i) => i.severity === 'warning');
  const { parts: h1, subs: h2 } = countHeadings(config.headings);

  const download = async () => {
    setBusy(true);
    try {
      const gen = await import('@/lib/generate');
      const cfg: TemplateConfig = config;
      const blob = await gen.buildTemplate(cfg, rubricBytes);
      const name = gen.templateFileName(cfg);
      downloadBlob(blob, name);
      addHistory({
        fileName: name,
        briefName: briefFile?.name ?? 'Brief',
        ...(rubricFile ? { rubricName: rubricFile.name } : {}),
        config: cfg,
      });
      setDone(name);
      toast.success(`Downloaded ${name}`);
    } catch (e) {
      toast.error(`The template could not be built: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <StepHeader step={4} title="Review & download" description="A last check against the brief, then your empty template is ready." />
      <div className="space-y-5">
        <Section
          title="Issues"
          description={
            issues.length
              ? `${warnings.length} warning${warnings.length === 1 ? '' : 's'}, ${issues.length - warnings.length} note${issues.length - warnings.length === 1 ? '' : 's'}`
              : undefined
          }
        >
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Nothing to flag. The template matches the brief.
            </p>
          ) : (
            <ul className="space-y-2">
              {issues.map((i) => (
                <IssueRow key={i.id} issue={i} />
              ))}
            </ul>
          )}
        </Section>

        <Section title="Page count">
          <div className="flex items-baseline justify-between text-sm">
            <span>
              The empty template has about <span className="font-semibold tabular-nums">{pages}</span> pages
            </span>
            {maxPages && <span className="text-muted-foreground">limit {maxPages}</span>}
          </div>
          {maxPages && <Progress className="mt-2" value={(pages / maxPages) * 100} label="Pages used of the page limit" />}
          <p className="mt-2 text-xs text-muted-foreground">
            Cover, contents, {h1} part{h1 === 1 ? '' : 's'}
            {h2 ? ` (${h2} sub-task${h2 === 1 ? '' : 's'})` : ''}
            {config.rubric.kind !== 'none' ? ' and the rubric' : ''}. Check whether the cover and rubric count toward the limit.
          </p>
        </Section>

        <motion.div layout className="rounded-lg border-2 border-primary/15 bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-display text-xl font-medium">Ready to download</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {config.format.font} {config.format.fontSizePt} pt · spacing {config.format.lineSpacing} · {config.format.paper}
              </p>
            </div>
            <Button size="lg" variant="warm" onClick={download} disabled={busy} className="min-w-48">
              {busy ? <Loader2 className="animate-spin" /> : <Download />}
              {busy ? 'Building…' : 'Download .docx'}
            </Button>
          </div>
          {done && (
            <p className="mt-4 flex items-center gap-2 text-sm text-success" role="status">
              <CheckCircle2 className="size-4" aria-hidden /> Saved {done}. Word may ask to update fields when you open it – choose Yes to
              fill the table of contents.
            </p>
          )}
          <p className="mt-4 flex gap-2 border-t pt-4 text-sm text-muted-foreground">
            <ExternalLink className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Need Google Docs? Upload this file to Google Drive and open it with Google Docs. Then use Insert → Table of contents to
              refresh the contents page.
            </span>
          </p>
        </motion.div>
      </div>

      <div className="mt-8 flex justify-start">
        <Button variant="ghost" onClick={() => setStep(2)}>
          <ArrowLeft /> Back
        </Button>
      </div>
    </div>
  );
}
