/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        // `gold`/`canvas`/`surface`/`parchment`/`slate`/`coal` are wired through the
        // `rgb(var(--x-rgb) / <alpha-value>)` pattern (not plain `var(--x)`) so that
        // Tailwind's opacity modifiers (e.g. `bg-gold/10`, `border-gold/50`) actually
        // generate a rule — a bare `var()` reference can't have alpha applied to it.
        gold: {
          DEFAULT: 'rgb(var(--dnd-gold-rgb) / <alpha-value>)',
          bright: 'var(--dnd-gold-bright)',
          dim: 'var(--dnd-gold-dim)',
          container: 'var(--dnd-gold-container)',
        },
        crimson: '#8b1a1a',
        canvas: 'rgb(var(--dnd-canvas-rgb) / <alpha-value>)',
        surface: 'rgb(var(--dnd-surface-rgb) / <alpha-value>)',
        elevated: 'var(--dnd-bg-raised)',
        overlay: 'var(--dnd-bg-overlay)',
        parchment: 'rgb(var(--dnd-text-rgb) / <alpha-value>)',
        slate: 'rgb(var(--dnd-slate-rgb) / <alpha-value>)',
        coal: 'rgb(var(--dnd-coal-rgb) / <alpha-value>)',
        danger: '#e05252',
        success: '#4caf82',
        subclass: 'var(--dnd-subclass-accent)',
        // Text/icon color for content sitting on top of an accent-filled surface
        // (e.g. `.btn-primary`) — flips to white for the Silver (light) scheme.
        'on-accent': 'var(--dnd-on-accent)',
        // Redirects Tailwind's built-in `white` (used app-wide as `white/NN` for
        // subtle borders, dividers, and hover overlays — never as literal opaque
        // white) to the current scheme's ink color, so those overlays stay visible
        // against Silver's light background instead of rendering as invisible
        // white-on-white.
        white: 'rgb(var(--dnd-text-rgb) / <alpha-value>)',
      },
      fontFamily: {
        brand: ['Cinzel', 'serif'],
        body: ['Nunito', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '20px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}
