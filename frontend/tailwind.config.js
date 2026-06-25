/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Sports-style dark palette
        ink: {
          900: '#0a0e16',
          800: '#0f1521',
          700: '#161e2e',
          600: '#1e293b',
          500: '#2a3a52',
        },
        accent: {
          DEFAULT: '#22c55e', // green = "live"
          dark: '#16a34a',
        },
        live: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        pulseLive: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        pulseLive: 'pulseLive 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
