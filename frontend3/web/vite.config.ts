import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, Vite joue le rôle de nginx : /api -> API lancée avec `npm run dev` dans ../api
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5175,
    proxy: { '/api': { target: 'http://localhost:8080', changeOrigin: true } },
  },
});
