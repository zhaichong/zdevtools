import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

export default defineConfig({
    plugins: [vue()],
    css: {
        postcss: {
            plugins: [tailwindcss(), autoprefixer()]
        }
    },
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                workbench: resolve(__dirname, 'workbench.html')
            }
        },
        outDir: 'dist'
    },
    server: {
        proxy: {
            '/api': 'http://127.0.0.1:8999',
            '/ws-proxy': {
                target: 'ws://127.0.0.1:8999',
                ws: true
            },
            '/devtools': 'http://127.0.0.1:8999'
        }
    },
    resolve: {
        alias: [
            { find: '@', replacement: resolve(__dirname, 'src') }
        ]
    }
});
