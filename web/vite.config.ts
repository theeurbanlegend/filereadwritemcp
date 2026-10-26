import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ROUTER_URL ?? 'http://localhost:3000';
const paths = ['/api', '/authorize', '/token', '/register', '/.well-known', '/mcp', '/agent'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      ...Object.fromEntries(paths.map((p) => [p, { target, changeOrigin: false }])),
      '/socket.io': { target, ws: true },
    },
  },
});
