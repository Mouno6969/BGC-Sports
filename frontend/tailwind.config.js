/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme base palette
        ink: {
          950: '#060a12',
          900: '#0a0e16',
          800: '#0f1521',
          700: '#161e2e',
          600: '#1e293b',
          500: '#2a3a52',
          400: '#3b4d6b',
          300: '#5a6f8f',
        },
        // Light theme base palette
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
        },
        // Primary accent (green = "live")
        accent: {
          DEFAULT: '#22c55e',
          light: '#4ade80',
          dark: '#16a34a',
          glow: 'rgba(34, 197, 94, 0.15)',
        },
        // Secondary accent (orange for highlights/badges)
        secondary: {
          DEFAULT: '#f97316',
          light: '#fb923c',
          dark: '#ea580c',
          glow: 'rgba(249, 115, 22, 0.15)',
        },
        // Status colors
        live: '#ef4444',
        success: '#22c55e',
        warning: '#eab308',
        info: '#3b82f6',
      },
      fontFamily: {
        display: ['Montserrat', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-green': '0 0 20px rgba(34, 197, 94, 0.3)',
        'glow-orange': '0 0 20px rgba(249, 115, 22, 0.3)',
        'glow-sm': '0 0 10px rgba(34, 197, 94, 0.2)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)',
        'card-light': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
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
        speaking: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.7)' },
          '50%': { boxShadow: '0 0 0 6px rgba(34, 197, 94, 0)' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        toast: {
          '0%': { opacity: '0', transform: 'translateY(-10px) scale(0.95)' },
          '10%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '90%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-10px) scale(0.95)' },
        },
      },
      animation: {
        pulseLive: 'pulseLive 1.5s ease-in-out infinite',
        speaking: 'speaking 1.5s ease-in-out infinite',
        fadeIn: 'fadeIn 0.4s ease-out',
        slideUp: 'slideUp 0.5s ease-out',
        slideInRight: 'slideInRight 0.4s ease-out',
        shimmer: 'shimmer 2s linear infinite',
        scaleIn: 'scaleIn 0.3s ease-out',
        toast: 'toast 3s ease-in-out forwards',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-gradient': 'linear-gradient(135deg, #0a0e16 0%, #161e2e 50%, #0f1521 100%)',
      },
    },
  },
  plugins: [],
};
