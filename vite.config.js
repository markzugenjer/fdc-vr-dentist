import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths so the build works at a domain root or in a sub-folder.
  base: './',
  // build time (Jakarta), shown small on the title screen so you can tell which version a headset runs
  define: { __BUILD__: JSON.stringify(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) },
  server: { port: 5175 },
  build: { outDir: 'dist', target: 'es2020', chunkSizeWarningLimit: 1200 },
});
