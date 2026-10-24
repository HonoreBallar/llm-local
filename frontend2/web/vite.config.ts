import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev : l'interface tourne sur Vite, l'API du veilleur dans Docker (port 3001).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: { '/api': process.env.VEILLEUR_URL || 'http://localhost:3001' },
  },
});
