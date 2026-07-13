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
          blue: '#2563EB',
          'blue-dark': '#1D4ED8',
          'blue-light': '#EFF6FF',
          navy: '#111827',
          gray: '#6B7280',
          border: '#E5E7EB',
          surface: '#F9FAFB',
          primary: '#0F3471',
          'primary-dark': '#0A2A5C',
          sidebar: '#111827',
          success: '#10B981',
          warning: '#F59E0B',
          info: '#3B82F6',
        },
      },
    },
  },
  plugins: [],
};
