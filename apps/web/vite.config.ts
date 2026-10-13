import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  preview: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    // Мобильная сборка упаковывается в APK — там карты исходников не нужны
    outDir: mode === 'mobile' ? 'dist-mobile' : 'dist',
    sourcemap: mode !== 'mobile',
  },
}));
