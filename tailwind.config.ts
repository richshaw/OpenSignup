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
          // Blue buttons darken to this on hover: white on it is 6.5:1.
          // Brightening them instead drops white text below 4.5:1.
          hover: '#1658c4',
          soft: '#dbe7ff',
        },
        surface: {
          DEFAULT: '#ffffff',
          raised: '#f7f8fa',
          sunk: '#eef1f5',
        },
        // Dark enough for 4.5:1 as small text on their own 10% tint, as in
        // StatusPill, over `surface.raised` as well as white.
        success: '#187544',
        warn: '#a64c08',
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
        rise: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'grow-in': {
          from: { opacity: '0', maxHeight: '0' },
          // In rem, so the cap grows with the text and never clips the row mid-animation.
          to: { opacity: '1', maxHeight: '3.5rem' },
        },
      },
      animation: {
        'spin-720': 'spin 720ms linear infinite',
        'check-draw': 'check-draw 360ms cubic-bezier(0.2, 0.7, 0.2, 1) forwards',
        // Magic Compose's questions arriving in the drafting frame.
        rise: 'rise 320ms cubic-bezier(0.2, 0.7, 0.2, 1) both',
        'fade-in': 'fade-in 240ms ease-out both',
        // backwards, not both: the row's height cap goes once it has grown in.
        'grow-in': 'grow-in 280ms ease-out backwards',
      },
    },
  },
  plugins: [],
} satisfies Config;
