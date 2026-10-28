/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0F172A',
        card: '#1B2336',
        fg: '#F8FAFC',
        muted: '#94A3B8',
        border: '#475569',
        actual: '#3B82F6',
        actualText: '#60A5FA',
        forecast: '#F59E0B',
        risk: '#EF4444',
        riskText: '#F87171',
        positive: '#22C55E',
        accent: '#22C55E',
      },
      fontFamily: {
        sans: ['"Fira Sans"', 'system-ui', 'sans-serif'],
        mono: ['"Fira Code"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.35), 0 8px 24px -18px rgb(0 0 0 / 0.6)',
      },
      maxWidth: {
        content: '1440px',
      },
    },
  },
  plugins: [],
}
