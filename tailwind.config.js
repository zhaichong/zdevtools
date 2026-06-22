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
        'glow': 'none',
        'glow-accent': 'none',
        'subtle': 'none',
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
          disabled: '#d1d5db'
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-strong)',
          subtle: '#e5e7eb'
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
