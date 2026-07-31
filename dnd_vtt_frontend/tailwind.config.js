/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#c9a227',
          bright: '#f5d67a',
          dim: '#a07c18',
          container: '#3a2c00',
        },
        crimson: '#8b1a1a',
        canvas: '#0d0e16',
        surface: '#171822',
        elevated: '#1e2033',
        overlay: '#252641',
        parchment: '#ede9df',
        slate: '#9e9b91',
        coal: '#4e4d49',
        danger: '#e05252',
        success: '#4caf82',
        subclass: 'var(--dnd-subclass-accent)',
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
        sm: '0 1px 4px rgba(0,0,0,0.5)',
        DEFAULT: '0 3px 12px rgba(0,0,0,0.6)',
        lg: '0 8px 28px rgba(0,0,0,0.75)',
      },
    },
  },
  plugins: [],
}
