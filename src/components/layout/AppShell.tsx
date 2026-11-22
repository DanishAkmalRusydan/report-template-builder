import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Github, Moon, ShieldCheck, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/primitives';
import { useTheme } from '@/store/theme';
import { cn } from '@/lib/utils';
import { GITHUB_URL } from '@/config';

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path d="M10 7h9l5 5v13a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" className="fill-background" />
        <rect x="12" y="14" width="8" height="1.8" rx=".9" className="fill-warm" />
        <rect x="12" y="18" width="9" height="1.2" rx=".6" className="fill-primary/40" />
        <rect x="12" y="21" width="7" height="1.2" rx=".6" className="fill-primary/40" />
      </svg>
      <span className="hidden font-display text-lg font-medium leading-none tracking-tight min-[400px]:inline">
        Template<span className="text-warm">.</span>builder
      </span>
    </span>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const label = resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={label}>
          {resolved === 'dark' ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const nav = [
  { to: '/build', label: 'Build' },
  { to: '/history', label: 'History' },
  { to: '/presets', label: 'Profiles' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const isBuilder = pathname.startsWith('/build');
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className={cn('mx-auto flex h-14 items-center gap-4 px-4', isBuilder ? 'max-w-[1440px]' : 'max-w-6xl')}>
          <Link to="/" className="rounded-md" aria-label="Report Template Builder home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:px-3',
                    isActive && 'bg-secondary text-foreground',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      {!isBuilder && (
        <footer className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              Runs entirely in your browser. No uploads, no accounts, no tracking.
            </span>
            <span className="sm:ml-auto inline-flex items-center gap-4">
              <span>Free and open source (MIT)</span>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-sm text-foreground hover:underline">
                <Github className="size-4" aria-hidden /> GitHub
              </a>
            </span>
          </div>
        </footer>
      )}
    </div>
  );
}
