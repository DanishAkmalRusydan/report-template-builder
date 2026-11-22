import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpenCheck, FileDown, FileSearch, FileText, ListTree, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HeroAnimation } from '@/components/landing/HeroAnimation';

const steps = [
  {
    icon: FileSearch,
    title: 'Upload your brief',
    body: 'Drop in the assignment brief (.docx or .pdf) and, if you have it, the rubric. They are read on your device.',
  },
  {
    icon: ListTree,
    title: 'Check the structure',
    body: 'Every part and sub-task becomes a heading. Drag to reorder, rename, or add what the brief forgot.',
  },
  {
    icon: FileDown,
    title: 'Download the .docx',
    body: 'Cover page, table of contents, one part per page and the rubric at the back, in the font and spacing the brief asks for.',
  },
];

const features = [
  { icon: FileText, title: 'Follows the brief', body: 'Font, size, line spacing, justification, paper size and page-number position come straight from the documentation rules.' },
  { icon: BookOpenCheck, title: 'Rubric attached', body: 'A rubric .docx is copied in unchanged – landscape pages, fonts and tables intact. Rubrics inside a PDF are rebuilt as a Word table.' },
  { icon: TriangleAlert, title: 'Catches the gotchas', body: 'Flags a past due date, a cover that says “individual” on a group brief, a missing coloured cover, or deliverables with no heading.' },
];

export function Landing() {
  const navigate = useNavigate();
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 md:grid-cols-[1.05fr_1fr] md:pt-20">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            Your files never leave your browser
          </span>
          <h1 className="mt-5 text-balance font-display text-4xl font-medium leading-[1.08] sm:text-5xl lg:text-[3.6rem]">
            Turn any assignment brief into a <em className="font-normal italic text-warm">ready-to-fill</em> Word template
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Upload the brief, get an empty, correctly formatted report: cover page, table of contents, every part on its own page, and the rubric
            at the end. You still write every word. It just saves the hour of setup.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" variant="warm" onClick={() => navigate('/build')} className="group">
              Start
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/build?example=1">Try an example</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Free. No sign-up. Works with Word and Google Docs.</p>
        </motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
          <HeroAnimation />
        </motion.div>
      </section>

      <section className="border-y bg-card/60">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl font-medium">How it works</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="relative rounded-lg border bg-background p-6">
                <span className="font-display text-5xl font-light leading-none text-warm/70">{i + 1}</span>
                <s.icon className="absolute right-6 top-6 size-5 text-muted-foreground" aria-hidden />
                <h3 className="mt-4 font-sans text-base font-semibold tracking-normal">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h2 className="font-display text-3xl font-medium">Structure only. Never content.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              The template has headings and nothing under them. No AI writing, no filler text – just the skeleton your lecturer expects, so
              you can spend your time on the actual report.
            </p>
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <p>
                <span className="font-medium">Private by design.</span> Everything runs in this tab. There is no server: briefs, rubrics and
                logos are never uploaded anywhere.
              </p>
            </div>
          </div>
          <ul className="grid gap-4">
            {features.map((f) => (
              <li key={f.title} className="flex gap-4 rounded-lg border bg-card p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-warm-soft text-warm">
                  <f.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-sans text-base font-semibold tracking-normal">{f.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-14 flex flex-col items-center gap-4 rounded-xl bg-primary px-6 py-12 text-center text-primary-foreground">
          <h2 className="text-balance font-display text-3xl font-medium">Your brief is due. Your template takes a minute.</h2>
          <Button size="lg" variant="warm" onClick={() => navigate('/build')}>
            Build my template <ArrowRight />
          </Button>
        </div>
      </section>
    </>
  );
}
