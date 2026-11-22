import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const hsl = (v: string) => `hsl(var(${v}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1200px' } },
    extend: {
      colors: {
        border: hsl('--border'),
        input: hsl('--input'),
        ring: hsl('--ring'),
        background: hsl('--background'),
        foreground: hsl('--foreground'),
        primary: { DEFAULT: hsl('--primary'), foreground: hsl('--primary-foreground') },
        secondary: { DEFAULT: hsl('--secondary'), foreground: hsl('--secondary-foreground') },
        muted: { DEFAULT: hsl('--muted'), foreground: hsl('--muted-foreground') },
        accent: { DEFAULT: hsl('--accent'), foreground: hsl('--accent-foreground') },
        warm: { DEFAULT: hsl('--warm'), foreground: hsl('--warm-foreground'), soft: hsl('--warm-soft') },
        destructive: { DEFAULT: hsl('--destructive'), foreground: hsl('--destructive-foreground') },
        success: hsl('--success'),
        warning: { DEFAULT: hsl('--warning'), soft: hsl('--warning-soft') },
        info: { DEFAULT: hsl('--info'), soft: hsl('--info-soft') },
        card: { DEFAULT: hsl('--card'), foreground: hsl('--card-foreground') },
        popover: { DEFAULT: hsl('--popover'), foreground: hsl('--popover-foreground') },
        paper: { DEFAULT: hsl('--paper'), ink: hsl('--paper-ink'), rule: hsl('--paper-rule') },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        display: ['"Newsreader Variable"', 'Georgia', 'serif'],
        sans: ['"Public Sans Variable"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        page: '0 1px 2px hsl(var(--shadow) / 0.10), 0 4px 12px hsl(var(--shadow) / 0.08)',
        lift: '0 2px 4px hsl(var(--shadow) / 0.06), 0 12px 32px hsl(var(--shadow) / 0.10)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        flash: { '0%': { boxShadow: '0 0 0 0 hsl(var(--warm) / 0.55)' }, '100%': { boxShadow: '0 0 0 10px hsl(var(--warm) / 0)' } },
      },
      animation: {
        flash: 'flash 0.9s ease-out 2',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
