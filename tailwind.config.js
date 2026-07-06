/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        tt: {
          blue: '#0066FF',
          'blue-dark': '#0044CC',
          'blue-light': '#F0F5FF',
          navy: '#001B4B',
          gray: '#5B6478',
          border: '#E5E9F0',
          surface: '#F5F7FA',
        },
      },
    },
  },
  plugins: [],
};
