import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { parseFile, ParseError } from '@/lib/parseClient';
import { inspectRubricDocx } from '@/lib/rubricInfo';
import { useBuilder } from '@/store/builder';
import { activePreset, usePresets } from '@/store/presets';
import type { ParsedBrief } from '@/lib/types';
import { countHeadings } from '@/lib/utils';

export type LoadStage = 'idle' | 'reading' | 'detecting' | 'done';

const MAX_BYTES = 25 * 1024 * 1024;

function summary(b: ParsedBrief) {
  const { parts: h1, subs: h2 } = countHeadings(b.headings);
  return `Found ${h1} part${h1 === 1 ? '' : 's'}${h2 ? ` and ${h2} sub-task${h2 === 1 ? '' : 's'}` : ''}.`;
}

export function useBriefLoader() {
  const [stage, setStage] = useState<LoadStage>('idle');
  const [noText, setNoText] = useState(false);
  const loadBrief = useBuilder((s) => s.loadBrief);
  const setRubric = useBuilder((s) => s.setRubric);

  const finish = useCallback(
    (brief: ParsedBrief, meta: { name: string; size: number }) => {
      loadBrief(brief, meta, activePreset(usePresets.getState()));
      setStage('done');
      if (brief.headings.length === 0) toast.warning('No headings were found in this brief. You can add them in the Structure step.');
      else toast.success(summary(brief));
    },
    [loadBrief],
  );

  const loadBriefFile = useCallback(
    async (file: File) => {
      setNoText(false);
      if (!/\.(docx|pdf)$/i.test(file.name)) {
        toast.error('Upload the brief as a .docx or .pdf file.');
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error('This file is larger than 25 MB. Try a smaller copy of the brief.');
        return;
      }
      setStage('reading');
      const t = setTimeout(() => setStage((s) => (s === 'reading' ? 'detecting' : s)), 350);
      try {
        const brief = await parseFile(file, (s) => setStage(s));
        finish(brief, { name: file.name, size: file.size });
      } catch (e) {
        setStage('idle');
        if (e instanceof ParseError && e.code === 'no-text') {
          setNoText(true);
          toast.error('This PDF has no text layer. Paste the brief text instead.');
        } else {
          toast.error((e as Error).message);
        }
      } finally {
        clearTimeout(t);
      }
    },
    [finish],
  );

  const loadExample = useCallback(async () => {
    setStage('reading');
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/sample-brief.docx`);
      if (!res.ok) throw new Error('The example brief could not be loaded.');
      const blob = await res.blob();
      await loadBriefFile(new File([blob], 'sample-brief.docx'));
    } catch (e) {
      setStage('idle');
      toast.error((e as Error).message);
    }
  }, [loadBriefFile]);

  const loadPastedText = useCallback(
    async (text: string) => {
      try {
        // Loaded on demand so the parser isn't part of the main bundle.
        const { parseBriefText } = await import('@/lib/parse');
        const brief = parseBriefText(text);
        setNoText(false);
        finish(brief, { name: 'Pasted brief', size: text.length });
        return true;
      } catch (e) {
        toast.error((e as Error).message);
        return false;
      }
    },
    [finish],
  );

  const loadRubricFile = useCallback(
    async (file: File) => {
      if (!/\.docx$/i.test(file.name)) {
        toast.error('Upload the rubric as a .docx file. A rubric inside the brief PDF is picked up automatically.');
        return;
      }
      try {
        const bytes = await file.arrayBuffer();
        const info = await inspectRubricDocx(bytes);
        setRubric({ name: file.name, size: file.size, ...info }, bytes);
        toast.success(`Rubric added${info.pages ? ` (${info.pages} page${info.pages === 1 ? '' : 's'}, ${info.landscape ? 'landscape' : 'portrait'})` : ''}.`);
      } catch (e) {
        toast.error((e as Error).message);
      }
    },
    [setRubric],
  );

  return { stage, noText, loadBriefFile, loadExample, loadPastedText, loadRubricFile };
}
