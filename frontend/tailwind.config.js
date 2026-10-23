/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12142B',      // verde casi negro: riel lateral y texto
        paper: '#F2F4F7',    // fondo de trabajo
        panel: '#FFFFFF',
        rule: '#D3DAE6',     // bordes
        slate: '#555B73',    // texto secundario
        route: { DEFAULT: '#10069F', dark: '#0B0475', soft: '#E8E7F8' }, // azul institucional
        verde: { DEFAULT: '#6DB52A', dark: '#3D7A12', soft: '#E9F4DA' },    // verde institucional del Transmetro
        signal: { DEFAULT: '#C98500', soft: '#FBEFD2' },
        alarm: { DEFAULT: '#C2362B', soft: '#F8DEDB' },
      },
      fontFamily: {
        display: ['Montserrat', 'system-ui', 'sans-serif'],
        sans: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
