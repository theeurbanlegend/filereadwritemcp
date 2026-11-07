import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const brand = decodeURIComponent(new URL('../../web/public', import.meta.url).pathname).replace(
  /^\/(?=[A-Za-z]:)/,
  '',
);

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: { '@brand': brand },
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
    fs: { allow: ['.', brand] },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
