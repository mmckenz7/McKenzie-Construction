import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#8CC63F',
          charcoal: '#222222',
          white: '#FFFFFF',
          gray: '#F5F5F5',
        },
      },
      boxShadow: {
        soft: '0 20px 50px -20px rgba(34, 34, 34, 0.25)',
      },
    },
  },
  plugins: [],
} satisfies Config;
