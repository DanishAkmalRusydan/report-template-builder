import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/primitives';
import { AppShell } from '@/components/layout/AppShell';
import { Landing } from '@/pages/Landing';
import { useTheme } from '@/store/theme';

const Builder = lazy(() => import('@/pages/Builder'));
const History = lazy(() => import('@/pages/History'));
const Presets = lazy(() => import('@/pages/Presets'));

export function App() {
  const theme = useTheme((s) => s.resolved);
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={250}>
        {/* HashRouter: refreshing /#/build works on GitHub Pages without a 404 fallback. */}
        <HashRouter>
          <AppShell>
            <Suspense fallback={<div className="min-h-[60vh]" />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/build" element={<Builder />} />
                <Route path="/history" element={<History />} />
                <Route path="/presets" element={<Presets />} />
                <Route path="*" element={<Landing />} />
              </Routes>
            </Suspense>
          </AppShell>
        </HashRouter>
        <Toaster theme={theme} position="bottom-right" richColors closeButton toastOptions={{ className: 'font-sans' }} />
      </TooltipProvider>
    </MotionConfig>
  );
}
