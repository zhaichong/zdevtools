const path = require('path');
const dir = __dirname.replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    `${dir}/index.html`,
    `${dir}/workbench.html`,
    `${dir}/src/**/*.{vue,js,ts,jsx,tsx}`,
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255, 255, 255, 0.05)',
        'glow-accent': '0 0 20px rgba(88, 166, 255, 0.15)',
        'subtle': '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
      },
      colors: {
        bg: {
          base: 'var(--bg)',
          layer: 'var(--panel)',
          raised: 'var(--panel-strong)'
        },
        border: {
          base: 'var(--border)'
        },
        text: {
          primary: 'var(--text)',
          secondary: 'var(--muted-strong)',
          tertiary: 'var(--muted)',
          disabled: 'rgba(255, 255, 255, 0.28)'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-strong)',
          subtle: 'rgba(88, 166, 255, 0.15)'
        },
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        success: 'var(--success)',
        info: '#58a6ff'
      },
      fontSize: {
        '2xs': ['10px', '14px'],
      }
    },
  },
  plugins: [],
}
