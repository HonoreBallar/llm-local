import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// En dev, Vite joue le rôle de nginx : /api -> passerelle, avec la clé lue dans ../backend/.env
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../backend', import.meta.url)), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.LLM_GATEWAY_URL || 'http://localhost:4000',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
          headers: { Authorization: `Bearer ${env.LLM_API_KEY}` },
        },
      },
    },
  };
});
