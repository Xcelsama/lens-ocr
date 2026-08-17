/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#0D1917',
          light: '#132824',
          lighter: '#1B342F',
        },
        paper: {
          DEFAULT: '#F6F3E9',
          dim: '#E7E2D2',
        },
        scan: {
          DEFAULT: '#79FFC2',
          dim: '#3FBF8F',
          soft: 'rgba(121, 255, 194, 0.15)',
        },
        rust: '#E2664B',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Inter"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      keyframes: {
        sweep: {
          '0%': { transform: 'translateY(-10%)' },
          '100%': { transform: 'translateY(110%)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
      },
      animation: {
        sweep: 'sweep 1.6s ease-in-out infinite',
        blink: 'blink 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
