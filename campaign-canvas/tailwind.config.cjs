/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        shell: '#11151a',
        canvas: '#12161b',
        panel: '#191e24',
        panelAlt: '#222830',
        ink: '#f3f5f7',
        secondary: '#a0aab5',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
