/** @type {import('tailwindcss').Config} */
const rgb = (v) => `rgb(var(${v}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: rgb('--c-surface'),
          card: rgb('--c-surface-card'),
          raised: rgb('--c-surface-raised'),
          inset: rgb('--c-surface-inset'),
          rail: rgb('--c-surface-rail'),
        },
        line: {
          DEFAULT: rgb('--c-border'),
          strong: rgb('--c-border-strong'),
          /* The edge of a field, which identifies a control and owes 3:1.
             `line` and `line-strong` separate surfaces and owe nothing. */
          control: rgb('--c-border-control'),
        },
        ink: {
          DEFAULT: rgb('--c-text-primary'),
          secondary: rgb('--c-text-secondary'),
          muted: rgb('--c-text-muted'),
          onrail: rgb('--c-text-onrail'),
          onrailmuted: rgb('--c-text-onrail-muted'),
        },
        gold: {
          /* Fills, rules and the focus ring — non-text, 3:1 is the bar. */
          DEFAULT: rgb('--c-accent'),
          /* Words. 4.5:1 on every surface, and it flips inside .on-dark. */
          text: rgb('--c-accent-text'),
          soft: rgb('--c-accent-soft'),
          strong: rgb('--c-accent-strong'),
          ink: rgb('--c-accent-ink'),
        },
        navy: {
          50: '#F2F5F9', 100: '#E2E8F0', 200: '#C4CEDC', 300: '#93A0AF',
          400: '#6B7889', 500: '#4A5768', 600: '#33404F', 700: '#24303F',
          800: '#1A2432', 850: '#131C27', 900: '#0F1620', 950: '#0A0F17',
        },
        /* Three values per status: the fill behind a bar or stripe, the
           soft ground of a chip, and the ink that goes on either. The
           `-soft` classes were being used in eight places and had never
           been defined here, so those chips compiled to no background at
           all — `.bg-status-good-soft` is absent from the built CSS. */
        status: {
          good: { DEFAULT: rgb('--c-status-good'), soft: rgb('--c-status-good-soft'), ink: rgb('--c-status-good-ink') },
          warning: { DEFAULT: rgb('--c-status-warning'), soft: rgb('--c-status-warning-soft'), ink: rgb('--c-status-warning-ink') },
          serious: { DEFAULT: rgb('--c-status-serious'), soft: rgb('--c-status-serious-soft'), ink: rgb('--c-status-serious-ink') },
          critical: { DEFAULT: rgb('--c-status-critical'), soft: rgb('--c-status-critical-soft'), ink: rgb('--c-status-critical-ink') },
          info: { DEFAULT: rgb('--c-status-info'), soft: rgb('--c-status-info-soft'), ink: rgb('--c-status-info-ink') },
        },
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--c-shadow) / 0.05), 0 8px 24px -12px rgb(var(--c-shadow) / 0.18)',
        lift: '0 2px 4px rgb(var(--c-shadow) / 0.06), 0 18px 40px -16px rgb(var(--c-shadow) / 0.28)',
        rail: '0 24px 60px -24px rgb(var(--c-shadow) / 0.55)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.04)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
        swift: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-480px 0' }, '100%': { backgroundPosition: '480px 0' } },
        'fade-rise': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s linear infinite',
        'fade-rise': 'fade-rise 0.4s cubic-bezier(0.22,1,0.36,1) both',
      },
    },
  },
  plugins: [],
}
