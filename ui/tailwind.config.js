/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nsw: {
          blue: '#002664',
          red:  '#d7153a',
        },
      },
    },
  },
  plugins: [],
};
