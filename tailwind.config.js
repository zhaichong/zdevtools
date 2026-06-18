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
