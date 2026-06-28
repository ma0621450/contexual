import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#14B8A6',
          'primary-hover': '#0F9E90',
          tint: '#CCFBF1',
        },
        accent: '#6366F1',
        surface: {
          page: '#FCFCFD',
          card: '#FFFFFF',
        },
        text: {
          primary: '#0F172A',
          muted: '#64748B',
        },
        border: {
          DEFAULT: '#E2E8F0',
        },
        semantic: {
          success: '#22C55E',
          warning: '#F59E0B',
          error: '#EF4444',
          info: '#3B82F6',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(15 23 42 / 0.04), 0 1px 2px -1px rgb(15 23 42 / 0.04)',
      },
      keyframes: {
        'fade-slide-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-slide-in': 'fade-slide-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
