import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { lg: '960px' },
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0b1220',
          muted: '#5b6474',
          // Lightest tone that still meets WCAG AA 4.5:1 for small text on
          // both `surface` (#fff) and `surface.raised` (#f7f8fa).
          soft: '#667085',
        },
        brand: {
          DEFAULT: '#1f6feb',
          soft: '#dbe7ff',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised: '#f7f8fa',
          sunk: '#eef1f5',
        },
        success: '#1a7f4a',
        warn: '#b45309',
        danger: '#be123c',
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        lg: '14px',
        xl: '18px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,18,32,0.04), 0 4px 16px rgba(11,18,32,0.06)',
      },
      transitionDuration: {
        180: '180ms',
      },
      transitionTimingFunction: {
        emphasized: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      },
      keyframes: {
        'check-draw': {
          from: { strokeDashoffset: '24' },
          to: { strokeDashoffset: '0' },
        },
      },
      animation: {
        'spin-720': 'spin 720ms linear infinite',
        'check-draw': 'check-draw 360ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards',
      },
    },
  },
  plugins: [],
} satisfies Config;
