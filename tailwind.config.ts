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
          soft: '#8a93a4',
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
    },
  },
  plugins: [],
} satisfies Config;
