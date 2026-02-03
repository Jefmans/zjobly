import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['zjobly.com', 'www.zjobly.com'],
    fs: {
      allow: [path.resolve(__dirname, '..', '..', 'config')],
    },
  },
});
