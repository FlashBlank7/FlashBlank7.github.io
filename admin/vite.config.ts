import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('./client', import.meta.url)),
  build: {outDir: '../build', emptyOutDir: true},
  server: {port: 5173, proxy: {'/api': 'http://127.0.0.1:8787', '/auth': 'http://127.0.0.1:8787'}},
});
