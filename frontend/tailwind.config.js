/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Premium dark theme palette
        navy: {
          950: '#060910',
          900: '#0B1120',
          800: '#0D1321',
          700: '#131B2E',
          600: '#1A2540',
          500: '#243352',
          400: '#2E4066',
          300: '#3D5580',
        },
        // Primary accent — emerald green
        accent: {
          DEFAULT: '#10B981',
          light: '#34D399',
          dark: '#059669',
          muted: '#10B98133',
        },
        // Status colors
        live: '#EF4444',
        success: '#10B981',
        warning: '#F59E0B',
        info: '#3B82F6',
      },
      fontFamily: {
        display: ['Montserrat', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'card': '0 2px 8px rgba(0, 0, 0, 0.3)',
        'card-hover': '0 8px 24px rgba(0, 0, 0, 0.4)',
        'nav': '0 2px 12px rgba(0, 0, 0, 0.3)',
        'speaking': '0 0 0 3px rgba(16, 185, 129, 0.5)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        pulseLive: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        pulseLive: 'pulseLive 1.5s ease-in-out infinite',
        fadeIn: 'fadeIn 0.3s ease-out',
        slideUp: 'slideUp 0.4s ease-out',
        shimmer: 'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
};
