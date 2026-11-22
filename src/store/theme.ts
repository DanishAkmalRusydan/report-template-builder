import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'rtb-theme';

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && systemDark());
  document.documentElement.classList.toggle('dark', dark);
}

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

interface ThemeState {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  set: (c: ThemeChoice) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const choice = typeof window === 'undefined' ? 'system' : read();
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().choice === 'system') {
        apply('system');
        set({ resolved: systemDark() ? 'dark' : 'light' });
      }
    });
  }
  const resolve = (c: ThemeChoice) => (c === 'dark' || (c === 'system' && systemDark()) ? 'dark' : 'light');
  return {
    choice,
    resolved: typeof window === 'undefined' ? 'light' : resolve(choice),
    set: (c) => {
      try {
        if (c === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, c);
      } catch {
        /* private mode */
      }
      apply(c);
      set({ choice: c, resolved: resolve(c) });
    },
    toggle: () => get().set(get().resolved === 'dark' ? 'light' : 'dark'),
  };
});
